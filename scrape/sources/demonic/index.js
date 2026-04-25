/**
 * scrape/sources/demonic/index.js -- Demonic Scans scraper
 *
 * Orchestrates the Demonic Scans scrape. Demonic has no API -- we scrape their
 * paginated "last updates" listing at lastupdates.php?list={n}.
 *
 * ── Scrape flow ───────────────────────────────────────────────────────────────
 *
 *  Phase 1 -- Listing pagination:
 *    Fetch pages sequentially, newest-first. Stop early when STOP_STREAK
 *    consecutive pages have no new or changed series. This works because the
 *    listing is ordered by last-updated, so once we hit a run of stale pages
 *    everything deeper is older.
 *
 *    Terminal-status series (Completed / Dropped) are excluded from the
 *    stop-streak check -- they'll never update, so we don't care if they're
 *    on a page full of changes.
 *
 *  Phase 2 -- Chapter fetches:
 *    For each series whose max_chapter changed since last run, fetch the series
 *    page to collect non-integer chapter numbers (see demonic/chapters.js).
 *    Fetches run in parallel batches of CONCURRENCY with REQ_DELAY_MS between
 *    batches to stay at roughly 2 req/s.
 *
 * ── State key ─────────────────────────────────────────────────────────────────
 *
 * State is keyed by the series slug (the path segment from /manga/{slug}/).
 * This is the only stable per-series identifier available on the listing page.
 * build_state() in scrape.js writes these slug-keyed entries alongside the
 * normalised-title entries used by API scrapers.
 */

const { extract_demonic_cards }    = require('./listing');
const { fetch_non_integer_chapters } = require('./chapters');
const { http_get, sleep }          = require('../../lib/helpers');

// Statuses that mean a series will never gain new chapters.
// These are excluded from the stop-streak check and from chapter fetches.
const TERMINAL_STATUSES = new Set(['Completed', 'Dropped']);

// Stop paginating after this many consecutive pages with no new/changed series.
const STOP_STREAK = 5;

// Parallel series-page fetches during the chapter phase.
const CONCURRENCY = 50;

// Milliseconds between page fetches and between chapter-fetch batches (2 req/s).
const REQ_DELAY_MS = 500;

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Series array ready for merge().
 */
async function scrape_demonic(opts = {})
{
	const state = opts.state ?? null;

	console.log('[Demonic] Starting...');

	const all_series = [];
	const seen_slugs = new Set();
	let   list_num        = 1;
	let   unchanged_pages = 0;

	// ── Phase 1: listing pagination ───────────────────────────────────────────

	while (true)
	{
		const url = `https://demonicscans.org/lastupdates.php?list=${list_num}`;
		console.log(`[Demonic] Fetching list=${list_num}, collected=${all_series.length}`);

		let cards = [];
		try
		{
			const { status, body } = await http_get(url);
			if (status === 200) cards = extract_demonic_cards(body);
		}
		catch (e)
		{
			console.error(`[Demonic] Fetch error on list=${list_num}: ${e.message}`);
		}

		if (cards.length === 0)
		{
			console.log('[Demonic] Empty page -- end of catalogue.');
			break;
		}

		// ── Per-page incremental check ────────────────────────────────────────
		// Check if ANY card on this page represents a change. We ignore terminal-
		// status series in this check since they cannot gain new chapters anyway.
		if (state)
		{
			const page_has_change = cards.some(card =>
			{
				const prev = state[card.slug];
				if (prev && TERMINAL_STATUSES.has(prev.status)) return false;
				return !prev || prev.max_chapter !== card.max_chapter;
			});

			if (page_has_change)
			{
				unchanged_pages = 0;
			}
			else
			{
				unchanged_pages++;
				console.log(`[Demonic] Page ${list_num}: all unchanged (${unchanged_pages}/${STOP_STREAK}).`);
				if (unchanged_pages >= STOP_STREAK)
				{
					console.log(`[Demonic] ${STOP_STREAK} consecutive unchanged pages -- stopping early.`);
					break;
				}
			}
		}

		// Accumulate new series, skipping terminal-status ones and duplicates.
		for (const card of cards)
		{
			if (seen_slugs.has(card.slug)) continue;
			const prev = state ? state[card.slug] : null;
			if (prev && TERMINAL_STATUSES.has(prev.status)) continue;

			seen_slugs.add(card.slug);
			all_series.push(card);
		}

		list_num++;
		await sleep(REQ_DELAY_MS);
	}

	// ── Phase 2: fetch non-integer chapters ───────────────────────────────────
	// Only fetch for series whose max_chapter changed since the last run,
	// or for brand-new series not yet in state.

	const to_fetch = state
		? all_series.filter(s =>
		{
			const prev = state[s.slug.toLowerCase()] ?? state[s.slug];
			return !prev || prev.max_chapter !== s.max_chapter;
		})
		: all_series;

	console.log(`[Demonic] Fetching chapters for ${to_fetch.length}/${all_series.length} changed series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);

		await Promise.all(batch.map(async (s) =>
		{
			const chapters = await fetch_non_integer_chapters(s._series_url);
			if (chapters.length > 0)
				s.chapters['Demonic Scans'] = chapters;
		}));

		console.log(`[Demonic] Chapters: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
		if (i + CONCURRENCY < to_fetch.length) await sleep(REQ_DELAY_MS);
	}

	// Clean up the temporary _series_url field from all entries.
	for (const s of all_series) delete s._series_url;

	console.log(`[Demonic] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_demonic };
