/**
 * scrape/sources/asura/index.js -- Asura Scans scraper
 *
 * Orchestrates the two-phase Asura scrape:
 *   Phase 1 -- Series list:    paginate the API until we hit STOP_STREAK
 *                               consecutive unchanged series.
 *   Phase 2 -- Chapter slugs:  for series with non-integer chapters, fetch
 *                               the full chapter list so the front-end can
 *                               build exact URLs.
 *
 * ── Incremental behaviour ────────────────────────────────────────────────────
 *
 * The API returns series sorted by most-recently-updated first. We compare
 * each item's chapter_count against the stored state. Once STOP_STREAK items
 * in a row are unchanged we stop paginating -- everything deeper is older.
 *
 * "Unchanged" means chapter_count matches state. Status changes (e.g. a series
 * going on Hiatus) do NOT reset the streak because they don't require fetching
 * a new chapter list -- the status is read for free from the list API.
 *
 * ── What gets stored ─────────────────────────────────────────────────────────
 *
 * Only non-integer chapter slugs (e.g. 12.5, 0/prologue) are stored per series.
 * Integer chapter URLs can be reconstructed on the front-end from the number alone,
 * so storing them would waste space without adding value.
 */

const { fetch_series_page, fetch_chapter_list, max_chapter_from_item } = require('./api');
const { sleep, normalise_title, normalise_status, is_non_integer_chapter } = require('../../lib/helpers');

// How many consecutive unchanged series before we stop paginating.
// Set to 5 so a single out-of-order result doesn't cause a premature stop.
const STOP_STREAK  = 5;

// Parallel chapter fetches per batch. Low to avoid hammering the API.
const CONCURRENCY  = 5;

// Milliseconds between chapter-fetch batches (2 req/s).
const REQ_DELAY_MS = 500;

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from the previous run, or null.
 * @returns {Promise<Array>}        Series array ready for merge().
 */
async function scrape_asura(opts = {})
{
	const state = opts.state ?? null;

	console.log('[Asura] Starting...');

	// ── Phase 1: paginate the series list ─────────────────────────────────────

	const series    = [];
	let   offset    = 0;
	let   unchanged = 0; // consecutive unchanged item counter

	outer:
	while (true)
	{
		console.log(`[Asura] Fetching offset=${offset}, collected=${series.length}`);

		let items;
		try
		{
			items = await fetch_series_page(offset);
		}
		catch (e)
		{
			console.error(`[Asura] Fetch error at offset ${offset}: ${e.message}`);
			break;
		}

		// Empty page = end of catalogue.
		if (items.length === 0)
		{
			console.log('[Asura] No more items.');
			break;
		}

		for (const item of items)
		{
			if (!item.slug || !item.title) continue;

			const new_count  = item.chapter_count != null ? parseFloat(item.chapter_count) : null;
			const max_ch     = max_chapter_from_item(item);

			// ── Incremental check ─────────────────────────────────────────────
			// Skip series whose chapter_count is unchanged -- no new chapters.
			// Accumulate a streak; bail out of pagination when it reaches STOP_STREAK.

			if (state)
			{
				const prev = state[normalise_title(item.title)];
				if (prev && prev.chapter_count === new_count)
				{
					unchanged++;
					if (unchanged >= STOP_STREAK)
					{
						console.log(`[Asura] ${STOP_STREAK} consecutive unchanged -- stopping early.`);
						break outer;
					}
					continue; // skip this series -- chapters haven't changed
				}
				unchanged = 0; // reset streak on any changed series
			}

			series.push({
				title:         item.title,
				slug:          item.slug,
				cover:         item.cover || null,
				status:        normalise_status(item.status),
				sources:       { 'Asura Scans': `https://asurascans.com/comics/${item.slug}` },
				max_chapter:   max_ch,
				chapter_count: new_count,
				chapters:      { 'Asura Scans': [] },
				_slug:         item.slug, // temporary -- removed after chapter fetch
			});
		}

		offset += 20;
	}

	// ── Phase 2: fetch non-integer chapter slugs ───────────────────────────────
	// Run in small parallel batches with a sleep between each to stay rate-limited.

	console.log(`[Asura] Fetching non-integer chapters for ${series.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < series.length; i += CONCURRENCY)
	{
		const batch = series.slice(i, i + CONCURRENCY);

		await Promise.all(batch.map(async (s) =>
		{
			const all_chapters      = await fetch_chapter_list(s._slug);
			const non_int_chapters  = all_chapters.filter(ch => is_non_integer_chapter(ch.number));

			if (non_int_chapters.length > 0)
			{
				s.chapters['Asura Scans'] = non_int_chapters.map(ch => ({
					name:         String(ch.number),
					chapter_slug: ch.chapter_slug,
				}));
			}

			delete s._slug; // clean up the temporary field
		}));

		console.log(`[Asura] Chapters: ${Math.min(i + CONCURRENCY, series.length)}/${series.length}`);
		if (i + CONCURRENCY < series.length) await sleep(REQ_DELAY_MS);
	}

	console.log(`[Asura] Done. Found ${series.length} series.`);
	return series;
}

module.exports = { scrape_asura };
