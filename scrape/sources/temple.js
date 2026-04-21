/*
 * scrape/sources/temple.js -- Temple Toons scraper
 *
 * DISCOVERY:
 *   Temple Toons embeds ALL series data as a JSON blob inside the HTML of their
 *   /comics listing page. The JSON is stored as an escaped string inside a
 *   <script> tag in the Next.js __NEXT_DATA__ block.
 *
 *   The entire page renders in just TWO LINES of HTML:
 *     Line 1: all HTML + inline CSS
 *     Line 2: all JavaScript including the JSON data
 *
 *   The JSON escaping level varies across Next.js versions:
 *     - Double-escaped: \\\"series_slug\\\":\\\"value\\\"  (literal \\\" in HTML)
 *     - Single-escaped: \"series_slug\":\"value\"           (literal \" in HTML)
 *   The scraper tries double-escaped first, then falls back to single-escaped.
 *
 * WHY REGEX INSTEAD OF JSON.PARSE?
 *   Parsing the JSON directly requires stripping multiple layers of escaping, which
 *   took hours to get right. Using targeted regex patterns on the raw escaped string
 *   turned out to be far simpler and equally reliable.
 *   We extract slugs, titles, thumbnails, chapter counts, and statuses with five
 *   separate patterns.
 *
 * STATUS:
 *   The embedded JSON includes a "status" field for every series (e.g. "Ongoing",
 *   "Completed", "Dropped").  We extract it with the same regex approach.
 *
 * CHAPTER SLUGS:
 *   Each series page contains a chapter list with "chapter_name" and "chapter_slug"
 *   for every chapter. We fetch and store ALL chapters (not just non-integer ones)
 *   because Temple Toons does not follow a predictable chapter URL pattern.
 *
 * INCREMENTAL MODE:
 *   The embedded JSON includes "_count.Chapter" for every series.  In quick mode
 *   we skip the per-series chapter-page fetch for any series whose chapter count
 *   matches the stored state.  Status is always taken from the listing page (free).
 *
 * GUARD:
 *   If the four core regex match counts differ (sign that the page structure changed),
 *   the scraper aborts entirely rather than producing corrupted data.
 */

const { fetch, sleep, decode_html_entities, add_cards, normalise_status } = require('./helpers');

// Normalise a title to the same key used in scrape_state.json.
// Mirrors normalise() in scrape.js exactly so state lookups hit correctly.
function _norm(title)
{
	return title.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// How many series pages to fetch in parallel when loading chapter lists.
const CONCURRENCY = 5;

// Two sets of patterns for the two escaping levels Next.js uses.
// Double-escaped: the JSON string is escaped inside another JS string.
// Single-escaped: the JSON string is escaped only once.
const PATTERNS =
{
	double:
	{
		slug:   /\\\\\\\"series_slug\\\\\\\":\\\\\\\"([a-z0-9\-]+)\\\\\\\"/g,
		title:  /\\\\\\\"title\\\\\\\":\\\\\\\"([^\\\\]+)\\\\\\\"/g,
		thumb:  /\\\\\\\"thumbnail\\\\\\\":\\\\\\\"(https:[^\\\\]+)\\\\\\\"/g,
		ccount: /\\\\\\\"_count\\\\\\\":\\\\\\{[^}]*\\\\\\\"Chapter\\\\\\\":(\\d+)/g,
		status: /\\\\\\\"status\\\\\\\":\\\\\\\"([^\\\\]+)\\\\\\\"/g,
	},
	single:
	{
		slug:   /\\\"series_slug\\\":\\\"([a-z0-9\-]+)\\\"/g,
		title:  /\\\"title\\\":\\\"([^\\\"]+)\\\"/g,
		thumb:  /\\\"thumbnail\\\":\\\"(https:[^\\\"]+)\\\"/g,
		ccount: /\\\"_count\\\":\{[^}]*\\\"Chapter\\\":(\\d+)/g,
		status: /\\\"status\\\":\\\"([^\\\"]+)\\\"/g,
	},
};

// Run all five patterns from a set against html, return arrays.
// Resets lastIndex on each pattern before running so the function is safe to call multiple times.
function run_patterns(html, pset)
{
	pset.slug.lastIndex   = 0;
	pset.title.lastIndex  = 0;
	pset.thumb.lastIndex  = 0;
	pset.ccount.lastIndex = 0;
	pset.status.lastIndex = 0;

	const slugs    = [];
	const titles   = [];
	const thumbs   = [];
	const ccounts  = [];
	const statuses = [];
	let m;

	while ((m = pset.slug.exec(html))   !== null) slugs.push(m[1]);
	while ((m = pset.title.exec(html))  !== null) titles.push(m[1]);
	while ((m = pset.thumb.exec(html))  !== null) thumbs.push(m[1]);
	while ((m = pset.ccount.exec(html)) !== null) ccounts.push(parseInt(m[1], 10));
	while ((m = pset.status.exec(html)) !== null) statuses.push(m[1]);

	return { slugs, titles, thumbs, ccounts, statuses };
}

// Convert a chapter slug into a float chapter number.
// e.g. "chapter-12-5" -> 12.5, "chapter-0" -> 0
// Returns null if the slug cannot be parsed.
function parse_chapter_slug(slug)
{
	if (!slug) return null;
	// Strip any leading numeric prefix (e.g. "01-chapter-5" -> "chapter-5").
	const clean    = slug.replace(/^\d+-/, '');
	// Strip the "chapter-" / "ch-" etc. prefix.
	const stripped = clean.replace(/^(?:chapter|ch|episode|ep)-/i, '');
	// Convert trailing "-N" to ".N" for decimal chapters (e.g. "12-5" -> "12.5").
	const normalised = stripped.replace(/-(\\d+)$/, '.$1');
	const n = parseFloat(normalised);
	return isNaN(n) ? null : n;
}

// Fetch all chapters for a single series page using regex on the escaped HTML.
// Returns an array of { name, chapter_slug } objects.
async function fetch_all_chapters(series_url)
{
	try
	{
		const res  = await fetch(series_url);
		if (res.status !== 200) return [];

		const html     = res.body;
		const chapters = [];

		// Match escaped "chapter_name":"..." and "chapter_slug":"..." pairs.
		// Single-escaped level is consistent on individual series pages.
		const pattern = /\\\"chapter_name\\\":\\\"([^\\\"]+)\\\".*?\\\"chapter_slug\\\":\\\"([^\\\"]+)\\\"/g;
		let m;
		while ((m = pattern.exec(html)) !== null)
		{
			chapters.push({
				name:         m[1],
				chapter_slug: m[2],
			});
		}

		// The page lists chapters newest-first; reverse so index 0 is chapter 1.
		chapters.reverse();
		return chapters;
	}
	catch (e)
	{
		console.error(`[Temple] Failed to fetch chapters for ${series_url}: ${e.message}`);
		return [];
	}
}

// opts.state   -- scrape_state map (series_slug -> { chapter_count }) or null
// opts.is_quick -- true when running in quick mode
async function scrape_temple_toons(opts = {})
{
	const state    = opts.state    || null;
	const is_quick = opts.is_quick || false;

	console.log(`[Temple] Starting (mode=${is_quick ? 'quick' : 'deep'})...`);
	const all_series = [];
	const seen_slugs = new Set();

	try
	{
		const res = await fetch('https://templetoons.com/comics');
		if (res.status !== 200)
		{
			console.error(`[Temple] HTTP ${res.status}`);
			return [];
		}

		const html = res.body;

		// Try double-escaped patterns first, fall back to single-escaped.
		// A result set is considered valid if all core counts match and slugs > 0.
		let matches      = run_patterns(html, PATTERNS.double);
		let escape_level = 'double';

		if (matches.slugs.length === 0 || matches.slugs.length !== matches.titles.length || matches.slugs.length !== matches.thumbs.length)
		{
			console.log('[Temple] Double-escaped patterns yielded no results, trying single-escaped...');
			matches      = run_patterns(html, PATTERNS.single);
			escape_level = 'single';
		}

		const { slugs: slug_matches, titles: title_matches, thumbs: thumb_matches, ccounts: ccount_matches, statuses: status_matches } = matches;

		console.log(`[Temple] escape_level=${escape_level}, slugs=${slug_matches.length}, titles=${title_matches.length}, thumbs=${thumb_matches.length}`);

		// If counts still differ, the page structure changed. Abort to avoid corrupted data.
		if (slug_matches.length === 0 || slug_matches.length !== title_matches.length || slug_matches.length !== thumb_matches.length)
		{
			console.error(`[Temple] Length mismatch -- aborting to prevent data corruption`);
			console.error(`  slugs: ${slug_matches.length}, titles: ${title_matches.length}, thumbs: ${thumb_matches.length}`);
			return [];
		}

		const count = slug_matches.length;
		for (let i = 1; i < count; i++)
		{
			const series_slug = slug_matches[i];
			const title       = title_matches[i];
			const cover       = thumb_matches[i];
			const raw_status  = status_matches[i] || null;
			const new_count   = ccount_matches[i] ?? null;

			if (!series_slug || seen_slugs.has(series_slug)) continue;
			// Titles of length 1 are almost certainly stray single characters from a parse error.
			if (!title || title.length <= 1) continue;

			const series_url = `https://templetoons.com/comic/${series_slug}`;

			seen_slugs.add(series_slug);
			all_series.push({
				title:         decode_html_entities(title),
				slug:          series_url,
				cover,
				status:        normalise_status(raw_status),
				sources:       { 'Temple Toons': series_url },
				chapters:      { 'Temple Toons': [] },
				max_chapter:   new_count,
				chapter_count: new_count,
				_series_url:   series_url,  // temporary
				_new_count:    new_count,   // for incremental check
				_skip_detail:  is_quick && state && state[_norm(title)] && state[_norm(title)].chapter_count === new_count,
			});
		}

		console.log(`[Temple] Fetching chapters for ${all_series.length} series...`);

		// Fetch full chapter lists for each series in small parallel batches.
		// Skip fetch when in quick mode and chapter_count is unchanged.
		for (let i = 0; i < all_series.length; i += CONCURRENCY)
		{
			const batch = all_series.slice(i, i + CONCURRENCY);
			await Promise.all(batch.map(async (s) =>
			{
				if (s._skip_detail)
				{
					// Mark chapters as null so merge logic keeps existing data.
					s.chapters['Temple Toons'] = null;
					return;
				}

				const chapters = await fetch_all_chapters(s._series_url);
				if (chapters.length > 0)
				{
					s.chapters['Temple Toons'] = chapters;

					// Recompute max_chapter from the scraped slugs -- more accurate
					// than the _count field on the listing page.
					let max = null;
					for (const ch of chapters)
					{
						const n = parse_chapter_slug(ch.chapter_slug);
						if (n !== null && (max === null || n > max)) max = n;
					}
					if (max !== null) s.max_chapter = max;
				}
			}));
			console.log(`[Temple] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
		}

		for (const s of all_series)
		{
			delete s._series_url;
			delete s._new_count;
			delete s._skip_detail;
		}
	}
	catch (e)
	{
		console.error(`[Temple] Error: ${e.message}`);
		console.error(e.stack);
		return [];
	}

	console.log(`[Temple] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_temple_toons };
