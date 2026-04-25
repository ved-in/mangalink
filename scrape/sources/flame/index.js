/**
 * scrape/sources/flame/index.js -- Flame Comics scraper
 *
 * Flame Comics has a proper API that returns all series in one request,
 * making the list phase very fast. The expensive part is the per-series
 * detail fetch (for cover + chapter tokens). Incremental mode skips the
 * detail fetch for unchanged series, keeping subsequent runs fast.
 *
 * ── Scrape flow ───────────────────────────────────────────────────────────────
 *
 *  1. Fetch buildId from the homepage (required to construct data endpoint URLs).
 *  2. Fetch the complete series list from /api/series.
 *  3. For each series:
 *       - If chapter_count matches state → emit a status-only entry (no detail fetch).
 *       - Otherwise → fetch the detail endpoint for cover + full chapter list.
 *
 * ── Null sentinel (chapters: null) ───────────────────────────────────────────
 *
 * For skipped series we emit `chapters: { 'Flame Comics': null }`. The merge
 * step in scrape.js treats null as "keep existing data" so unchanged chapter
 * lists are preserved in the output chunks without re-fetching.
 */

const { fetch_build_id, fetch_all_series, fetch_series_detail } = require('./api');
const { sleep, normalise_title, normalise_status, decode_html_entities } = require('../../lib/helpers');

// Milliseconds between per-series detail requests (2 req/s).
// When skipping unchanged series a 50ms short sleep is used instead
// to keep the loop responsive without hammering the API.
const REQ_DELAY_MS      = 500;
const SKIP_DELAY_MS     = 50;

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Series array ready for merge().
 */
async function scrape_flame(opts = {})
{
	const state = opts.state ?? null;

	console.log('[Flame] Starting...');

	// Step 1: get the current buildId so we can construct detail endpoint URLs.
	let build_id;
	try
	{
		build_id = await fetch_build_id();
		console.log(`[Flame] buildId: ${build_id}`);
	}
	catch (e)
	{
		console.error(`[Flame] Could not get buildId: ${e.message}`);
		return [];
	}

	// Step 2: fetch the complete series list in one API call.
	let series_list;
	try
	{
		series_list = await fetch_all_series();
		console.log(`[Flame] Found ${series_list.length} series`);
	}
	catch (e)
	{
		console.error(`[Flame] Could not fetch series list: ${e.message}`);
		return [];
	}

	// Step 3: process each series.
	const all_series = [];

	for (const item of series_list)
	{
		const { id, label: title, status, chapter_count, image } = item;
		if (!id || !title) continue;

		const new_count  = chapter_count != null ? parseFloat(chapter_count) : null;
		const new_status = normalise_status(status);
		const state_key  = normalise_title(title);
		const prev       = state ? state[state_key] : null;

		// ── Incremental skip ──────────────────────────────────────────────────
		// chapter_count unchanged → skip the expensive detail fetch.
		// We still push an entry so the merge step can update status.

		const skip_detail = prev != null && prev.chapter_count === new_count;
		console.log(`[Flame] ${skip_detail ? 'Skipping (unchanged)' : 'Processing'}: ${title} (id=${id})`);

		if (skip_detail)
		{
			all_series.push({
				title:           decode_html_entities(title),
				slug:            `https://flamecomics.xyz/series/${id}`,
				cover:           null,              // keep existing cover from chunks
				status:          new_status,
				sources:         { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
				flame_series_id: id,
				max_chapter:     new_count,
				chapter_count:   new_count,
				chapters:        { 'Flame Comics': null }, // null = don't overwrite in merge
			});
			await sleep(SKIP_DELAY_MS);
			continue;
		}

		// ── Full detail fetch ─────────────────────────────────────────────────

		const { cover, chapters } = await fetch_series_detail(id, build_id);

		// Fallback cover: use the list API's image field if the detail page had none.
		const cover_url = cover
			?? (image ? `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${image}` : null);

		all_series.push({
			title:           decode_html_entities(title),
			slug:            `https://flamecomics.xyz/series/${id}`,
			cover:           cover_url,
			status:          new_status,
			sources:         { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
			flame_series_id: id,
			max_chapter:     new_count,
			chapter_count:   new_count,
			chapters:        { 'Flame Comics': chapters },
		});

		await sleep(REQ_DELAY_MS);
	}

	console.log(`[Flame] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_flame };
