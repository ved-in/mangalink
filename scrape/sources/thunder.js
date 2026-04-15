/*
 * scrape/sources/thunder.js -- Thunder Scans scraper
 *
 * Thunder Scans does not have an API. We scrape their paginated manga listing.
 *
 * SERIES LIST:
 *   GET https://en-thunderscans.com/comics/?page={n}
 *   Cards live inside ".listupd .bs .bsx". We stop after 5 consecutive pages
 *   with no new series.
 *
 * STATUS:
 *   Each card element carries a "status-ongoing", "status-completed", or
 *   "status-hiatus" CSS class.  We extract this directly from the card HTML --
 *   no extra requests needed.
 *
 * MAX CHAPTER:
 *   The latest chapter label (e.g. "Chapter 46.2") is embedded in the raw HTML
 *   as class="epxs">...</div> but is commented out in the rendered DOM, so cheerio
 *   cannot see it. We extract it from the raw HTML string with a regex before
 *   loading cheerio, then align it with cards by index.
 *
 * SERIES SLUGS:
 *   Some series have a leading numeric prefix in their comics/ URL
 *   (e.g. /comics/0086250808-title/) but their chapter URLs omit that prefix.
 *   The front-end thunder.js source strips the prefix when constructing chapter URLs.
 *
 * NON-INTEGER CHAPTERS:
 *   Fetched from each series page via the #chapterlist. Only non-integer chapter
 *   slugs are stored because integer chapter URLs can be constructed on the front-end.
 *
 * INCREMENTAL MODE:
 *   The listing is ordered by last-updated.  In quick mode we stop after
 *   STOP_STREAK consecutive cards whose scraped max_chapter matches the stored
 *   state value -- anything below that point was not updated since the last run.
 *   Status is always re-read (free, comes from the card CSS class).
 *   Non-integer chapter slugs are only re-fetched for changed series.
 */

const cheerio = require('cheerio');
const { fetch, decode_html_entities, add_cards } = require('./helpers');

// Returns true for chapter numbers that are not positive integers (including 0).
function is_non_integer(num)
{
	const n = parseFloat(num);
	return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

// Fetch non-integer chapters for a single Thunder series page.
// Reads the #chapterlist and returns { number, chapter_slug } for each entry.
async function fetch_series_chapters(series_url)
{
	try
	{
		const res = await fetch(series_url);
		if (res.status !== 200) return [];

		const cheerio = require('cheerio');
		const $       = cheerio.load(res.body);
		const chapters = [];

		$('#chapterlist ul li').each((_, elem) =>
		{
			const num  = $(elem).attr('data-num');
			const href = $(elem).find('a[href]').first().attr('href');
			if (!num || !href) return;
			const ch_slug = href.replace(/\/$/, '').split('/').pop();
			chapters.push({ number: parseFloat(num), chapter_slug: ch_slug });
		});

		return chapters;
	}
	catch (e)
	{
		console.error(`[Thunder] Failed chapters for ${series_url}: ${e.message}`);
		return [];
	}
}

// Extract the status string from a card element's class list.
// Returns a canonical status string or null.
function extract_status_from_card($el, $)
{
	const cls = $el.attr('class') || '';
	if (cls.includes('status-ongoing'))   return 'Ongoing';
	if (cls.includes('status-completed')) return 'Completed';
	if (cls.includes('status-hiatus'))    return 'Hiatus';
	if (cls.includes('status-dropped'))   return 'Dropped';
	// Also check child elements -- some themes put it on an inner span.
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

// Parse manga cards from a Thunder Scans listing page HTML.
// The .epxs latest-chapter labels are extracted from the raw HTML string
// because cheerio cannot see them (they are rendered as HTML comments).
function extract_thunder_cards(html)
{
	const $          = cheerio.load(html);
	const cards      = [];
	const seen_slugs = new Set();

	// Pull all .epxs values from the raw HTML string in document order.
	const epxs_re   = /class="epxs">([^<]+)<\/div>/g;
	const epxs_vals = [];
	let m;
	while ((m = epxs_re.exec(html)) !== null) epxs_vals.push(m[1].trim());

	// card_idx aligns each card with its epxs value since cheerio and raw order match.
	let card_idx = 0;
	$('.listupd .bs .bsx').each((i, el) =>
	{
		const $el  = $(el);
		const link = $el.find('a').first();
		const href = link.attr('href');
		if (!href) return;

		// Extract the series slug from the comics/ URL segment.
		const slug = href.match(/\/comics\/([^\/]+)\/?/)?.[1];
		if (!slug || seen_slugs.has(slug)) return;

		const title       = $el.find('.tt').text().trim() || slug.replace(/-/g, ' ');
		const cover       = $el.find('.limit img').attr('src');
		const max_chapter = parse_chapter_label(epxs_vals[card_idx] || '');
		const series_url  = `https://en-thunderscans.com/comics/${slug}/`;
		const status      = extract_status_from_card($el, $);

		seen_slugs.add(slug);
		cards.push({
			title:       decode_html_entities(title),
			slug,
			cover,
			status,
			sources:     { 'Thunder Scans': series_url },
			max_chapter,
			chapters:    { 'Thunder Scans': [] },
			_series_url: series_url,  // temporary
		});
		card_idx++;
	});

	return cards;
}

// Parse a chapter label string into a float.
// Handles "Chapter 46.2", "Ch. 12", "Episode 3", bare numbers, etc.
function parse_chapter_label(text)
{
	if (!text) return null;
	const m = text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
	          || text.match(/(\d+(?:\.\d+)?)/);
	return m ? parseFloat(m[1]) : null;
}

// opts.state   -- scrape_state map (slug -> { max_chapter, status }) or null
// opts.is_quick -- true when running in quick mode
// opts.req_delay_ms -- milliseconds to sleep between page fetches (deep mode rate limit)
async function scrape_thunder(opts = {})
{
	const state        = opts.state        || null;
	const is_quick     = opts.is_quick     || false;
	const req_delay_ms = opts.req_delay_ms || 0;

	console.log(`[Thunder] Starting (mode=${is_quick ? 'quick' : 'deep'})...`);
	const all_series       = [];
	const seen_slugs       = new Set();
	let page               = 1;
	let consecutive_no_new = 0;

	// In quick mode we also stop when STOP_STREAK consecutive cards have
	// unchanged max_chapter relative to the stored state.
	const STOP_STREAK = 3;
	let   stop_count  = 0;

	outer:
	while (consecutive_no_new < 5)
	{
		const url = `https://en-thunderscans.com/comics/?page=${page}`;
		console.log(`[Thunder] Fetching page ${page}, total=${all_series.length}`);

		let res;
		try
		{
			res = await fetch(url);
		}
		catch (e)
		{
			console.error(`[Thunder] Fetch error: ${e.message}`);
			break;
		}

		if (res.status !== 200)
		{
			console.error(`[Thunder] HTTP ${res.status}, stopping.`);
			break;
		}

		const cards = extract_thunder_cards(res.body);

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
						console.log(`[Thunder] ${STOP_STREAK} consecutive unchanged -- stopping early.`);
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
		console.log(`[Thunder] Page ${page}: ${cards.length} cards, ${added} new, total=${all_series.length}`);

		if (added === 0)
		{
			consecutive_no_new++;
			console.log(`[Thunder] No new series (${consecutive_no_new}/5 consecutive).`);
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

	console.log(`[Thunder] Fetching non-integer chapters for ${to_fetch.length}/${all_series.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);
		await Promise.all(batch.map(async (s) =>
		{
			const all_chapters = await fetch_series_chapters(s._series_url);
			const filtered     = all_chapters.filter(ch => is_non_integer(ch.number));
			if (filtered.length)
			{
				s.chapters['Thunder Scans'] = filtered.map(ch => ({
					name:         String(ch.number),
					chapter_slug: ch.chapter_slug,
				}));
			}
		}));
		console.log(`[Thunder] Chapters fetched: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
	}

	for (const s of all_series) delete s._series_url;

	console.log(`[Thunder] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_thunder };
