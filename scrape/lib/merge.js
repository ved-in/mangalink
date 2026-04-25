/**
 * scrape/lib/merge.js
 *
 * Merges per-scraper series lists into one deduplicated, alphabetically-sorted
 * master list, patching it on top of whatever was already in the chunk files.
 *
 * ── Why we load existing chunks as the baseline ───────────────────────────────
 *
 * Each run only scrapes recently-updated series (incremental mode). If we merged
 * only what scrapers returned this run, series that weren't touched would vanish
 * from the output. Loading the existing chunks first gives us the full catalogue
 * as the starting point, and scrapers only patch what they actually saw.
 *
 * ── Merge rules (applied per incoming scraper item) ──────────────────────────
 *
 *   cover        first non-null value wins; never overwritten once set
 *   max_chapter  always the highest value seen across all sources and runs
 *   status       highest-priority wins: Dropped > Hiatus > Ongoing > Completed
 *   sources      all source URLs are accumulated; new ones are added, none removed
 *   chapters     per-source; fresh scraper data overwrites the stored list.
 *                A null sentinel (used by Flame and Temple quick-skip) means
 *                "keep whatever is already stored for this source".
 *   other fields (demonic_id, flame_series_id, …) first value wins; never cleared
 *
 * ── Deduplication ────────────────────────────────────────────────────────────
 *
 * Series are matched by normalise_title(title). This normalisation strips
 * accents, punctuation, and casing so that minor title variations across sources
 * (e.g. "Nano Machine" vs "Nano-Machine") map to the same entry.
 */

const fs   = require('fs');
const path = require('path');
const { normalise_title, merge_status } = require('./helpers');

const CHUNKS_DIR = path.join(__dirname, '..', '..', 'data', 'chunks');

// ── Chunk baseline ────────────────────────────────────────────────────────────

/**
 * Read all existing chunk files and return a Map<normalised_title, series_object>.
 * Returns an empty Map on first run (no chunks yet).
 */
function load_existing_chunks()
{
	const map = new Map();
	if (!fs.existsSync(CHUNKS_DIR)) return map;

	// Sort chunk files numerically so chunk_10 comes after chunk_9, not chunk_1.
	const files = fs.readdirSync(CHUNKS_DIR)
		.filter(f => /^chunk_\d+\.json$/.test(f))
		.sort((a, b) =>
		{
			const na = parseInt(a.match(/\d+/)[0], 10);
			const nb = parseInt(b.match(/\d+/)[0], 10);
			return na - nb;
		});

	for (const file of files)
	{
		try
		{
			const data = JSON.parse(fs.readFileSync(path.join(CHUNKS_DIR, file), 'utf8'));
			for (const series of data)
			{
				if (series.title) map.set(normalise_title(series.title), series);
			}
		}
		catch (e)
		{
			console.warn(`[Chunks] Could not parse ${file}: ${e.message}`);
		}
	}

	console.log(`Loaded ${map.size} existing series from chunks`);
	return map;
}

// ── Merge ─────────────────────────────────────────────────────────────────────

/**
 * Merge all scraper output lists on top of the existing chunk baseline.
 *
 * @param {Array[]}  lists     One array per scraper, each containing series objects.
 * @param {Map}      existing  Output of load_existing_chunks().
 * @returns {Array}            Sorted, deduplicated master series list.
 */
function merge(lists, existing)
{
	// Clone the baseline map so we always start from the full previous catalogue.
	const map = new Map(existing);

	for (const list of lists)
	{
		for (const item of list)
		{
			// Guard: skip scraper artifacts with blank or missing titles.
			if (!item.title || !item.title.trim())
			{
				console.warn(`[merge] Skipping entry with empty title (slug: ${item.slug ?? 'unknown'})`);
				continue;
			}

			const key = normalise_title(item.title);

			if (map.has(key))
			{
				// ── Patch an existing entry ───────────────────────────────────
				const entry = map.get(key);

				// Accumulate source URLs -- never remove existing ones.
				for (const [src, url] of Object.entries(item.sources || {}))
				{
					if (!(src in entry.sources)) entry.sources[src] = url;
				}

				// Cover: keep the first non-null value; don't clear it.
				if (!entry.cover && item.cover) entry.cover = item.cover;

				// max_chapter: always keep the highest value across all runs.
				if (item.max_chapter != null &&
					(entry.max_chapter == null || item.max_chapter > entry.max_chapter))
				{
					entry.max_chapter = item.max_chapter;
				}

				// Status: highest priority wins.
				entry.status = merge_status(entry.status, item.status);

				// Chapters (per-source): null sentinel = keep existing, otherwise overwrite.
				if (item.chapters)
				{
					if (!entry.chapters) entry.chapters = {};
					for (const [src, ch_list] of Object.entries(item.chapters))
					{
						if (ch_list !== null) entry.chapters[src] = ch_list;
					}
				}

				// Extra source-specific fields (demonic_id, flame_series_id, …):
				// copy in any that don't already exist on the entry.
				const RESERVED = new Set(['title', 'slug', 'cover', 'status', 'sources',
				                          'chapters', 'max_chapter', 'chapter_count']);
				for (const [field, value] of Object.entries(item))
				{
					if (!RESERVED.has(field) && entry[field] === undefined)
						entry[field] = value;
				}
			}
			else
			{
				// ── Add a brand-new series ────────────────────────────────────
				// Remove internal scraper fields that shouldn't reach the output.
				const { slug, ...rest } = item;

				if (!('max_chapter' in rest)) rest.max_chapter = null;
				if (!('chapters'    in rest)) rest.chapters    = {};
				if (!('status'      in rest)) rest.status      = null;

				// Replace any null sentinels in the chapter lists with empty arrays
				// (sentinels only make sense when patching an existing entry).
				for (const src of Object.keys(rest.chapters))
				{
					if (rest.chapters[src] === null) rest.chapters[src] = [];
				}

				map.set(key, rest);
			}
		}
	}

	// Return a stable alphabetical sort so chunk boundaries are deterministic.
	return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

module.exports = { load_existing_chunks, merge };
