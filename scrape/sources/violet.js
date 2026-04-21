/*
 * scrape/sources/violet.js -- Violet Scans scraper  (GL/BL manhwa)
 *
 * Very similar structure to the Thunder Scans scraper -- same WordPress-based
 * manga theme (.listupd .bs .bsx cards, #chapterlist chapter list).
 *
 * SERIES LIST:
 *   GET https://violetscans.org/comics/?page={n}
 *   Stop after 5 consecutive pages with no new series.
 *
 * STATUS:
 *   Same as Thunder: cards carry "status-ongoing", "status-completed", etc.
 *   CSS classes.  Extracted directly from the card element -- no extra requests.
 *
 * .epxs QUIRK:
 *   The .epxs latest-chapter labels are commented out in the rendered DOM (same
 *   as Thunder Scans), so we extract them from the raw HTML string with regex
 *   before passing the HTML to cheerio.
 *
 * NON-INTEGER CHAPTERS:
 *   Fetched from each series page via the #chapterlist. Only non-integer chapter
 *   slugs are stored -- integer chapter URLs can be constructed on the front-end.
 *
 * INCREMENTAL MODE:
 *   Same strategy as Thunder: stop after STOP_STREAK consecutive cards with
 *   unchanged max_chapter.  Only re-fetch chapter pages for changed series.
 */

const cheerio = require('cheerio');
const { fetch, decode_html_entities, add_cards } = require('./helpers');

// Returns true for chapter numbers that are not positive integers (including 0).
function is_non_integer(num)
{
	const n = parseFloat(num);
	return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

// Fetch non-integer chapters for a single Violet series page.
async function fetch_series_chapters(series_url)
{
	try
	{
		const res = await fetch(series_url);
		if (res.status !== 200) return [];

		const $        = cheerio.load(res.body);
		const chapters = [];

		$('#chapterlist ul li').each((_, elem) =>
		{
			const num  = $(elem).attr('data-num');
			const href = $(elem).find('a[href]').first().attr('href');
			if (!num || !href) return;
			chapters.push({
				number:       parseFloat(num),
				chapter_slug: href.replace(/\/$/, '').split('/').pop(),
			});
		});

		return chapters;
	}
	catch (e)
	{
		console.error(`[Violet] Failed chapters for ${series_url}: ${e.message}`);
		return [];
	}
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

// Parse manga cards from a Violet Scans listing page.
// Follows the same pattern as extract_thunder_cards() in thunder.js.
function extract_violet_cards(html)
{
	const cards      = [];
	const seen_slugs = new Set();
	const $          = cheerio.load(html);

	// Extract .epxs labels from raw HTML (commented out in the DOM, invisible to cheerio).
	const epxs_re   = /class="epxs">([^<]+)<\/div>/g;
	const epxs_vals = [];
	let em;
	while ((em = epxs_re.exec(html)) !== null) epxs_vals.push(em[1].trim());

	let card_idx = 0;
	$('.listupd .bs .bsx').each((_, el) =>
	{
		const $el  = $(el);
		const element = $el;
		const link    = element.find('a').first();
		const href    = link.attr('href');
		if (!href || !href.includes('/comics/')) return;

		// Normalise the URL -- ensure it has a trailing slash, then extract the slug.
		const url  = href.endsWith('/') ? href : href + '/';
		const slug = url.replace(/\/$/, '').split('/').pop();
		if (!slug || seen_slugs.has(slug)) return;

		// Title from the link's title= attribute is most reliable (never truncated).
		const title =
			link.attr('title') ||
			element.find('.tt').text().trim() ||
			slug.replace(/-/g, ' ');

		const cover =
			element.find('.limit img').attr('src') ||
			element.find('img').first().attr('src') ||
			null;

		// Parse the latest chapter label from the corresponding .epxs value.
		let max_chapter = null;
		const epxs_text = epxs_vals[card_idx] || '';
		if (epxs_text)
		{
			const m = epxs_text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
			       || epxs_text.match(/(\d+(?:\.\d+)?)/);
			if (m) max_chapter = parseFloat(m[1]);
		}

		const status = extract_status_from_card($el, $);

		seen_slugs.add(slug);
		cards.push({
			title:       decode_html_entities(title),
			slug,
			cover,
			status,
			sources:     { 'Violet Scans': url },
			max_chapter,
			chapters:    { 'Violet Scans': [] },
			_series_url: url,  // temporary
		});
		card_idx++;
	});

	return cards;
}

// opts.state   -- scrape_state map (slug -> { max_chapter }) or null
// opts.is_quick -- true when running in quick mode
// opts.req_delay_ms -- milliseconds to sleep between page fetches (deep mode rate limit)
async function scrape_violet(opts = {})
{
	const state        = opts.state        || null;
	const is_quick     = opts.is_quick     || false;
	const req_delay_ms = opts.req_delay_ms || 0;

	console.log(`[Violet] Starting (mode=${is_quick ? 'quick' : 'deep'})...`);
	const all_series       = [];
	const seen_slugs       = new Set();
	let page               = 1;
	let consecutive_no_new = 0;

	const STOP_STREAK = 3;
	let   stop_count  = 0;

	outer:
	while (consecutive_no_new < 5)
	{
		const url = `https://violetscans.org/comics/?page=${page}`;
		console.log(`[Violet] Fetching page ${page}, total=${all_series.length}`);

		let res;
		try
		{
			res = await fetch(url);
		}
		catch (e)
		{
			console.error(`[Violet] Fetch error: ${e.message}`);
			break;
		}

		if (res.status !== 200)
		{
			console.error(`[Violet] HTTP ${res.status}, stopping.`);
			break;
		}

		const cards = extract_violet_cards(res.body);

		if (is_quick && state)
		{
			for (const card of cards)
			{
				const prev = state[card.slug];
				if (prev && prev.max_chapter === card.max_chapter)
				{
					stop_count++;
					if (stop_count >= STOP_STREAK)
					{
						console.log(`[Violet] ${STOP_STREAK} consecutive unchanged -- stopping early.`);
						break outer;
					}
				}
				else
				{
					stop_count = 0;
				}
			}
		}

		const added = add_cards(cards, all_series, seen_slugs);
		console.log(`[Violet] Page ${page}: ${cards.length} cards, ${added} new, total=${all_series.length}`);

		if (added === 0)
		{
			consecutive_no_new++;
			console.log(`[Violet] No new series (${consecutive_no_new}/5 consecutive).`);
		}
		else
		{
			consecutive_no_new = 0;
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

	console.log(`[Violet] Fetching non-integer chapters for ${to_fetch.length}/${all_series.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);
		await Promise.all(batch.map(async (s) =>
		{
			const all_chapters = await fetch_series_chapters(s._series_url);
			const filtered     = all_chapters.filter(ch => is_non_integer(ch.number));
			if (filtered.length)
			{
				s.chapters['Violet Scans'] = filtered.map(ch => ({
					name:         String(ch.number),
					chapter_slug: ch.chapter_slug,
				}));
			}
		}));
		console.log(`[Violet] Chapters fetched: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
	}

	for (const s of all_series) delete s._series_url;

	console.log(`[Violet] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_violet };
