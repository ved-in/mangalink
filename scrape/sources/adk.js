/*
 * scrape/sources/adk.js -- ADK Scans scraper  (silentquill.net)
 *
 * ADK does not have an API. We scrape their paginated manga listing page.
 *
 * SERIES LIST:
 *   GET https://www.silentquill.net/manga/?page={n}
 *   Each page contains manga cards inside ".listupd .bs .bsx" elements.
 *   We stop after 5 consecutive pages with no new series.
 *
 * STATUS:
 *   Cards carry "status-ongoing", "status-completed", etc. CSS classes,
 *   identical to the Thunder/Violet theme. Extracted from the card element
 *   directly -- no extra requests.
 *
 * CHAPTER DATA:
 *   Each series page has a "#chapterlist ul li" structure where each item
 *   has a data-num attribute (chapter number) and an anchor href (chapter URL).
 *   We only fetch and store non-integer chapters (e.g. 11.5, 0) because
 *   integer chapter URLs can be reconstructed on the front-end from the slug.
 *
 * MAX CHAPTER:
 *   Extracted from the ".epxs" label on each listing card (e.g. "Chapter 11.5 End").
 *   Parsed by parse_chapter_label() which handles several common label formats.
 *   ADK's .epxs IS visible to cheerio (unlike Thunder/Violet where it is commented out).
 *
 * INCREMENTAL MODE:
 *   Same strategy as Thunder/Violet: stop after STOP_STREAK consecutive cards with
 *   unchanged max_chapter.  Only re-fetch chapter pages for changed series.
 */

const cheerio = require('cheerio');
const { fetch, decode_html_entities } = require('./helpers');

// Returns true for chapter numbers that are not positive integers (including 0).
function is_non_integer(num)
{
	const n = parseFloat(num);
	return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

// Fetch the chapter list for a single series page.
// Reads the #chapterlist and extracts chapter numbers + URL slugs.
async function fetch_series_chapters(series_url)
{
	try
	{
		const res = await fetch(series_url);
		if (res.status !== 200) return [];

		const $        = cheerio.load(res.body);
		const chapters = [];

		$('#chapterlist ul li').each((i, elem) =>
		{
			const num  = $(elem).attr('data-num');
			const a    = $(elem).find('a[href]').first();
			const href = a.attr('href');
			if (!num || !href) return;
			chapters.push({
				number:       parseFloat(num),
				// Extract the slug from the last path segment of the chapter URL.
				chapter_slug: href.replace(/\/$/, '').split('/').pop(),
			});
		});

		return chapters;
	}
	catch (e)
	{
		console.error(`[ADK] Failed chapters for ${series_url}: ${e.message}`);
		return [];
	}
}

// Parse a chapter label string into a float.
// Handles common formats: "Chapter 11.5 End", "Ch. 12", "Episode 3", "47".
function parse_chapter_label(text)
{
	if (!text) return null;
	const m = text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
	          || text.match(/(\d+(?:\.\d+)?)/);
	return m ? parseFloat(m[1]) : null;
}

// Extract canonical status from the card's CSS classes.
function extract_status_from_card($el, $)
{
	const cls = $el.attr('class') || '';
	if (cls.includes('status-ongoing'))   return 'Ongoing';
	if (cls.includes('status-completed')) return 'Completed';
	if (cls.includes('status-hiatus'))    return 'Hiatus';
	if (cls.includes('status-dropped'))   return 'Dropped';
	let found = null;
	$el.find('[class*="status-"]').each((_, el) =>
	{
		if (found) return;
		const c = $(el).attr('class') || '';
		if (c.includes('status-ongoing'))   found = 'Ongoing';
		if (c.includes('status-completed')) found = 'Completed';
		if (c.includes('status-hiatus'))    found = 'Hiatus';
		if (c.includes('status-dropped'))   found = 'Dropped';
	});
	return found;
}

// opts.state   -- scrape_state map (slug -> { max_chapter }) or null
// opts.is_quick -- true when running in quick mode
// opts.req_delay_ms -- milliseconds to sleep between page fetches (deep mode rate limit)
async function scrape_adk(opts = {})
{
	const state        = opts.state        || null;
	const is_quick     = opts.is_quick     || false;
	const req_delay_ms = opts.req_delay_ms || 0;

	console.log(`[ADK] Starting (mode=${is_quick ? 'quick' : 'deep'})...`);
	const all_series    = [];
	const seen_slugs    = new Set();
	let page            = 1;
	let consecutive_empty = 0;

	const STOP_STREAK = 3;
	let   stop_count  = 0;

	// Keep paginating until 5 pages in a row yield no new series, or quick-stop fires.
	outer:
	while (consecutive_empty < 5)
	{
		const url = `https://www.silentquill.net/manga/?page=${page}`;
		console.log(`[ADK] Fetching page ${page}, total=${all_series.length}`);

		let res;
		try
		{
			res = await fetch(url);
		}
		catch (e)
		{
			console.error(`[ADK] Fetch error: ${e.message}`);
			consecutive_empty++;
			page++;
			continue;
		}

		if (res.status !== 200)
		{
			console.error(`[ADK] HTTP ${res.status}, stopping.`);
			break;
		}

		const $     = cheerio.load(res.body);
		const cards = [];

		// ADK uses a non-standard card layout. The ".bigor .tt" selector is tried
		// first; ".tt" alone is the fallback. If both miss, the slug is humanised.
		$('.listupd .bs .bsx').each((i, elem) =>
		{
			const $el  = $(elem);
			const element = $el;
			const link    = element.find('a:first');
			const href    = link.attr('href');
			if (!href) return;

			let slug = href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '');
			if (seen_slugs.has(slug)) return;

			let title =
				element.find('.bigor .tt').text().trim()
				|| element.find('.tt').text().trim()
				|| slug.replace(/-/g, ' ');

			let cover =
				element.find('img').attr('data-src')
				|| element.find('img').attr('src');

			// Prepend origin if cover is a relative path.
			if (cover && !cover.startsWith('http'))
			{
				cover = 'https://www.silentquill.net' + cover;
			}

			// The .epxs element contains the latest chapter label, e.g. "Chapter 11.5 End".
			const epxs_text   = element.find('.epxs').text().trim();
			const max_chapter = parse_chapter_label(epxs_text);
			const status      = extract_status_from_card($el, $);

			cards.push({
				title:       decode_html_entities(title),
				slug:        href,
				cover,
				status,
				sources:     { 'ADK Scans': href },
				max_chapter,
				chapters:    { 'ADK Scans': [] },
				_series_url: href,  // temporary, used for chapter fetch
			});
		});

		if (is_quick && state)
		{
			for (const card of cards)
			{
				// ADK slug is the full href; state is keyed the same way.
				const prev = state[card.slug];
				if (prev && prev.max_chapter === card.max_chapter)
				{
					stop_count++;
					if (stop_count >= STOP_STREAK)
					{
						console.log(`[ADK] ${STOP_STREAK} consecutive unchanged -- stopping early.`);
						break outer;
					}
				}
				else
				{
					stop_count = 0;
				}
			}
		}

		for (const c of cards)
		{
			if (!seen_slugs.has(c.slug))
			{
				seen_slugs.add(c.slug);
				all_series.push(c);
			}
		}

		if (cards.length === 0)
		{
			consecutive_empty++;
			console.log(`[ADK] Page ${page}: 0 cards (${consecutive_empty}/5 consecutive empty).`);
		}
		else
		{
			consecutive_empty = 0;
			console.log(`[ADK] Page ${page}: ${cards.length} cards, total=${all_series.length}`);
		}

		page++;

		if (req_delay_ms > 0)
		{
			const { sleep } = require('./helpers');
			await sleep(req_delay_ms);
		}
	}

	// Only fetch non-integer chapters for series that changed (or all in deep mode).
	const CONCURRENCY = 5;
	const to_fetch    = is_quick && state
		? all_series.filter(s => { const p = state[s.slug]; return !p || p.max_chapter !== s.max_chapter; })
		: all_series;

	console.log(`[ADK] Fetching non-integer chapters for ${to_fetch.length}/${all_series.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);
		await Promise.all(batch.map(async (s) =>
		{
			const all_chapters = await fetch_series_chapters(s._series_url);
			const filtered     = all_chapters.filter(ch => is_non_integer(ch.number));
			if (filtered.length)
			{
				s.chapters['ADK Scans'] = filtered.map(ch => ({
					name:         String(ch.number),
					chapter_slug: ch.chapter_slug,
				}));
			}
			delete s._series_url;
		}));
		console.log(`[ADK] Chapters fetched: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
	}

	// Clean up _series_url on any entries not in to_fetch (unchanged ones still have it).
	for (const s of all_series) delete s._series_url;

	console.log(`[ADK] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_adk };
