/**
 * scrape/sources/temple/index.js -- Temple Toons scraper
 *
 * Orchestrates the Temple Toons scrape. Temple is a Next.js site that embeds
 * the complete series catalogue as an escaped JSON blob in its /comics page --
 * so the entire series list is fetched in ONE HTTP request.
 *
 * The expensive part is the per-series chapter fetch (one request per series).
 * Incremental mode skips this for series whose chapter count hasn't changed,
 * keeping subsequent runs fast.
 *
 * ── Scrape flow ───────────────────────────────────────────────────────────────
 *
 *  1. GET https://templetoons.com/comics  (one request for the full list)
 *  2. Extract series data with regex (see temple/patterns.js for why regex).
 *  3. For each series:
 *       - If chapter_count matches state → mark _skip_detail = true.
 *       - Otherwise → fetch the series page for the full chapter list.
 *  4. Return all series with their chapter data (or null sentinel for skipped ones).
 *
 * ── _skip_detail and the null sentinel ───────────────────────────────────────
 *
 * Skipped series have `chapters: { 'Temple Toons': null }`. The merge step in
 * scrape.js treats null as "keep existing chapter data from the last chunk write"
 * so we don't lose chapter lists for unchanged series.
 */

const { extract_with_fallback }                   = require('./patterns');
const { fetch_all_chapters, parse_chapter_slug_to_number } = require('./chapters');
const { http_get_with_retry, sleep, decode_html_entities,
        normalise_title, normalise_status }        = require('../../lib/helpers');

// Parallel chapter fetches per batch. Keep small to stay polite.
const CONCURRENCY  = 5;
// Milliseconds between chapter-fetch batches (2 req/s).
const REQ_DELAY_MS = 500;

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Series array ready for merge().
 */
async function scrape_temple_toons(opts = {})
{
	const state = opts.state ?? null;

	console.log('[Temple] Starting...');

	// ── Step 1: fetch the listing page ────────────────────────────────────────

	let html;
	try
	{
		const { status, body } = await http_get_with_retry('https://templetoons.com/comics');
		if (status !== 200)
		{
			console.error(`[Temple] Listing page returned HTTP ${status}`);
			return [];
		}
		html = body;
	}
	catch (e)
	{
		console.error(`[Temple] Failed to fetch listing page: ${e.message}`);
		return [];
	}

	// ── Step 2: extract series data with regex ────────────────────────────────

	const { matches, escape_level } = extract_with_fallback(html);
	const { slugs, titles, thumbs, ccounts, statuses } = matches;

	console.log(`[Temple] escape_level=${escape_level}, slugs=${slugs.length}, titles=${titles.length}, thumbs=${thumbs.length}`);

	// If core counts still don't align the page structure may have changed.
	// Abort rather than produce corrupted data.
	if (slugs.length === 0 || slugs.length !== titles.length || slugs.length !== thumbs.length)
	{
		console.error(`[Temple] Field count mismatch (slugs=${slugs.length}, titles=${titles.length}, thumbs=${thumbs.length}) -- aborting to prevent data corruption.`);
		return [];
	}

	// ── Step 3: build the series list, marking which need chapter fetches ─────

	const all_series = [];
	const seen_slugs = new Set();

	// Index starts at 1 because index 0 is always a stray match from the page shell,
	// not an actual series entry.
	for (let i = 1; i < slugs.length; i++)
	{
		const series_slug = slugs[i];
		const title       = titles[i];
		const cover       = thumbs[i];
		const raw_status  = statuses[i] || null;
		const new_count   = ccounts[i] ?? null; // null if this series has no _count field

		if (!series_slug || seen_slugs.has(series_slug)) continue;
		if (!title || title.length <= 1) continue; // single-char titles are parse artifacts
		seen_slugs.add(series_slug);

		const series_url  = `https://templetoons.com/comic/${series_slug}`;
		const state_entry = state ? state[normalise_title(title)] : null;

		// Skip the chapter fetch if nothing changed since the previous run.
		// We check chapter_count first (exact), then fall back to max_chapter
		// comparison in case chapter_count wasn't extractable from the listing page.
		const chapter_count_unchanged = new_count !== null && state_entry?.chapter_count === new_count;
		const max_chapter_unchanged   = new_count === null && state_entry?.max_chapter != null;
		const skip_detail = !!(state_entry && (chapter_count_unchanged || max_chapter_unchanged));

		all_series.push({
			title:         decode_html_entities(title),
			slug:          series_url,
			cover,
			status:        normalise_status(raw_status),
			sources:       { 'Temple Toons': series_url },
			chapters:      { 'Temple Toons': [] },
			max_chapter:   new_count,
			chapter_count: new_count,
			_series_url:   series_url, // removed after chapter fetch
			_skip_detail:  skip_detail,
		});
	}

	// ── Step 4: fetch chapters in batches ─────────────────────────────────────

	const to_fetch_count = all_series.filter(s => !s._skip_detail).length;
	console.log(`[Temple] Fetching chapters for ${to_fetch_count}/${all_series.length} series...`);

	for (let i = 0; i < all_series.length; i += CONCURRENCY)
	{
		const batch     = all_series.slice(i, i + CONCURRENCY);
		const has_fetch = batch.some(s => !s._skip_detail);

		await Promise.all(batch.map(async (s) =>
		{
			if (s._skip_detail)
			{
				// Null sentinel tells merge() to keep the existing chapter list.
				s.chapters['Temple Toons'] = null;
				return;
			}

			const chapters = await fetch_all_chapters(s._series_url);

			if (chapters.length > 0)
			{
				s.chapters['Temple Toons'] = chapters;

				// Recompute max_chapter from the scraped slugs -- more accurate
				// than the _count field extracted from the listing page.
				let max = null;
				for (const ch of chapters)
				{
					const n = parse_chapter_slug_to_number(ch.chapter_slug);
					if (n !== null && (max === null || n > max)) max = n;
				}
				if (max !== null) s.max_chapter = max;
			}
		}));

		console.log(`[Temple] Chapters: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
		// Only sleep between batches that made real network requests.
		if (has_fetch && i + CONCURRENCY < all_series.length) await sleep(REQ_DELAY_MS);
	}

	// Clean up temporary fields.
	for (const s of all_series)
	{
		delete s._series_url;
		delete s._skip_detail;
	}

	console.log(`[Temple] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_temple_toons };
