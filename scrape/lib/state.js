/**
 * scrape/lib/state.js
 *
 * Loads, saves, and builds the scrape_state.json file.
 *
 * ── What is scrape_state.json? ────────────────────────────────────────────────
 *
 * A flat JSON object committed to the repo alongside the data chunks. It lets
 * each scraper compare new results against the previous run so it knows which
 * series actually changed -- and can skip unchanged ones to save requests.
 *
 * ── Schema ────────────────────────────────────────────────────────────────────
 *
 * The same file contains two kinds of entries, identified by their key format:
 *
 *   "<normalised_title>" : { status, max_chapter, chapter_count }
 *     Written for every series, keyed by normalise(title).
 *     Used by API scrapers (Asura, Flame, Temple) which have reliable titles.
 *
 *   "<html_scraper_slug>" : { status, max_chapter }
 *     Written for HTML-scraped series (Demonic, Thunder, Violet, ADK).
 *     Keyed by the listing-page slug (path segment), because the slug is the
 *     only stable per-series identifier on those sites.
 *     These entries are deduplicated from the title-keyed entries.
 *
 * ── build_state() ─────────────────────────────────────────────────────────────
 *
 * After each scrape run, build_state() walks the merged series array and
 * the per-scraper raw lists to produce an updated state object:
 *
 *   1. For every series in the merged array → write a title-keyed entry.
 *   2. For every HTML-scraper series → also write a slug-keyed entry.
 *      (Only if the slug differs from the normalised title, to avoid duplicates.)
 */

const fs   = require('fs');
const path = require('path');
const { normalise_title } = require('./helpers');

const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'scrape_state.json');

// ── Load / Save ───────────────────────────────────────────────────────────────

/**
 * Load and return the scrape_state from disk.
 * Returns an empty object when the file doesn't exist or can't be parsed.
 */
function load_state()
{
	try
	{
		if (fs.existsSync(STATE_FILE))
			return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
	}
	catch (e)
	{
		console.warn(`[State] Could not load state file: ${e.message} -- starting fresh.`);
	}
	return {};
}

/**
 * Write the scrape_state object to disk.
 * @param {object} state
 */
function save_state(state)
{
	const dir = path.dirname(STATE_FILE);
	fs.mkdirSync(dir, { recursive: true });
	
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), 'utf8');
	console.log(`\nWrote scrape_state.json (${Object.keys(state).length} entries)`);
}

// ── Build ─────────────────────────────────────────────────────────────────────

/**
 * Build a fresh state object from the just-merged series array and the
 * per-scraper raw result lists (needed for the HTML-scraper slug entries).
 *
 * @param {Array}  merged         Output of merge() -- the full deduplicated list.
 * @param {object} raw_by_src     Map of source-name -> raw scraper output array.
 *                                e.g. { 'Thunder Scans': [...], 'Asura Scans': [...] }
 * @returns {object}              The new state object ready for save_state().
 */
function build_state(merged, raw_by_src)
{
	const state = {};

	// Title-keyed entries: one per unique series, written from the merged array.
	for (const series of merged)
	{
		if (!series.title) continue;
		const key = normalise_title(series.title);
		state[key] =
		{
			status:        series.status        || null,
			max_chapter:   series.max_chapter   ?? null,
			chapter_count: series.chapter_count ?? null,
		};
	}

	// Slug-keyed entries: one per HTML-scraper series.
	// These give Demonic/Thunder/Violet/ADK an O(1) lookup by their card slug
	// rather than having to normalise titles to find their state entry.
	const HTML_SOURCES = ['Demonic Scans', 'Thunder Scans', 'Violet Scans', 'ADK Scans'];

	for (const src_name of HTML_SOURCES)
	{
		const list = raw_by_src[src_name] || [];
		for (const item of list)
		{
			if (!item.slug) continue;

			// Skip if the slug is the same string as the normalised title --
			// that key already exists from the title-keyed loop above.
			if (item.slug === normalise_title(item.title)) continue;

			// Skip if this slug key is already set (e.g. same series on two sources).
			if (state[item.slug]) continue;

			state[item.slug.toLowerCase()] =
			{
				max_chapter: item.max_chapter ?? null,
				status:      item.status      || null,
			};
		}
	}

	return state;
}

module.exports = { load_state, save_state, build_state };
