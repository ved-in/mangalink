/**
 * scrape/scrape.js
 *
 * Main scraper entry point. Run with:
 *   node scrape/scrape.js              -- deep scan (full catalogue, 2 req/s per HTML source)
 *   node scrape/scrape.js --quick      -- incremental update (stop early when nothing changed)
 *
 * Executed by GitHub Actions on a schedule to keep the data fresh.
 *
 * MODES:
 *   --quick  Runs every 6 hours.  Each scraper stops as soon as it detects a
 *            streak of unchanged series.  For Asura/Flame/Temple the savings are
 *            from skipping per-series API calls; for HTML scrapers the savings
 *            are from stopping pagination early.  Status is still updated on
 *            every run for all sources.
 *
 *   (deep)   Runs every 2 days.  Full catalogue scrape at 2 req/s per HTML source
 *            (500 ms inter-request delay).  Catches new series, slug changes, and
 *            status corrections that incremental runs might miss.
 *
 * STATE FILE (data/scrape_state.json):
 *   Persists per-series data between runs so the quick mode has something to
 *   compare against.  Committed to the repo alongside index.json so CI jobs
 *   can read the previous run's data without any external storage.
 *
 *   Schema:
 *   {
 *     "<normalised_title>": {          -- one entry per unique series
 *       "status":        "Ongoing" | "Completed" | "Hiatus" | "Dropped" | null,
 *       "max_chapter":   <number> | null,
 *       "chapter_count": <number> | null   -- from API sources (Asura/Flame/Temple)
 *     },
 *     "<html_scraper_slug>": {         -- extra entries for HTML-scraper quick checks
 *       "max_chapter":   <number> | null,  -- used by Demonic/Thunder/Violet/ADK
 *       "status":        <string>  | null
 *     }
 *   }
 *
 *   API scrapers (Asura/Flame/Temple) look up state by normalise(title).
 *   HTML scrapers (Demonic/Thunder/Violet/ADK) look up state by their card slug
 *   (the path segment in the listing URL) -- the only stable per-series identifier
 *   available without an API.
 *
 * WHAT IT DOES:
 *   1. Loads data/scrape_state.json (or starts with an empty state).
 *   2. Runs all source scrapers (parallel for quick, parallel for deep).
 *   3. Merges the results into a single deduplicated list sorted alphabetically.
 *      - When the same series appears on multiple sources their data is merged:
 *          cover       -- first non-null value wins
 *          max_chapter -- highest value across all sources
 *          chapters    -- per-source, each source keeps its own list
 *          status      -- highest-priority value: Dropped>Hiatus>Ongoing>Completed>null
 *          source-specific IDs (demonic_id, flame_series_id) -- first value wins
 *      - chapter lists with a null sentinel (Flame/Temple quick skip) are not
 *        overwritten -- the existing chunk data is kept unchanged.
 *   4. Writes data/index.json and data/chunks/chunk_N.json.
 *   5. Writes data/scrape_state.json with updated per-series state.
 *
 * INDEX ENTRY SHAPE:
 *   { i, t, c, s, src, m, k }
 *     i   -- position within its chunk (global_index % CHUNK_SIZE)
 *     t   -- title
 *     c   -- cover URL
 *     s   -- status string (e.g. "Ongoing") or null
 *     src -- array of source CODES (single chars, saves ~230KB vs full names)
 *     m   -- max_chapter
 *     k   -- chunk number (Math.floor(global_index / CHUNK_SIZE))
 *
 * MERGE BEHAVIOUR:
 *   When the same series appears on multiple sources, their data is merged:
 *     - sources dict gets all source entries
 *     - cover is taken from whichever source provides one first
 *     - max_chapter is always the HIGHEST value seen across all sources
 *     - chapters are kept per-source (each source has its own chapter list)
 *     - any extra fields (demonic_id, flame_series_id, etc.) are added if not already present
 *   Entries with empty/blank titles are skipped with a warning.
 */

const fs   = require('fs');
const path = require('path');

const { scrape_asura }        = require('./sources/asura');
const { scrape_thunder }      = require('./sources/thunder');
const { scrape_adk }          = require('./sources/adk');
const { scrape_demonic }      = require('./sources/demonic');
const { scrape_temple_toons } = require('./sources/temple');
const { scrape_flame }        = require('./sources/flame');
const { scrape_violet }       = require('./sources/violet');
const { merge_status }        = require('./sources/helpers');

// ── CLI ──────────────────────────────────────────────────────────────────────

const IS_QUICK = process.argv.includes('--quick');

// Inter-request delay used by HTML scrapers in deep mode (2 req/s).
const DEEP_REQ_DELAY_MS = 500;

// ── Paths ────────────────────────────────────────────────────────────────────

const OUT_DIR    = path.join(__dirname, '..', 'data');
const CHUNKS_DIR = path.join(OUT_DIR, 'chunks');
const STATE_FILE = path.join(OUT_DIR, 'scrape_state.json');

// ── Normalise title (dedup key) ───────────────────────────────────────────────

// Normalise a title for deduplication: lowercase, strip accents and punctuation,
// collapse whitespace. Mirrors the same function in js/api.js.
function normalise(title)
{
	return title.toLowerCase()
		.normalize('NFKD')          // split accented chars into base + combining mark
		.replace(/[^\w\s]/g, '')    // drop every non-word, non-space character
		.replace(/\s+/g, ' ')       // collapse multiple spaces to one
		.trim();
}

// ── State helpers ─────────────────────────────────────────────────────────────

function load_state()
{
	try
	{
		if (fs.existsSync(STATE_FILE))
			return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
	}
	catch (e)
	{
		console.warn(`[State] Could not load ${STATE_FILE}: ${e.message} -- starting fresh.`);
	}
	return {};
}

function save_state(state)
{
	fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 1), 'utf8');
	console.log(`\nWrote scrape_state.json (${Object.keys(state).length} entries)`);
}

// ── Merge ────────────────────────────────────────────────────────────────────

// Merge an array of per-source series lists into one deduplicated sorted array.
// Series are matched by their normalised title.
function merge(lists)
{
	const map = new Map();

	for (const list of lists)
	{
		for (const item of list)
		{
			// Skip entries with missing or blank titles -- they are scraper artifacts.
			if (!item.title || !item.title.trim())
			{
				console.warn(`[merge] Skipping entry with empty title (slug: ${item.slug ?? 'unknown'})`);
				continue;
			}

			const key = normalise(item.title);

			if (map.has(key))
			{
				// Series already seen -- merge new source data into the existing entry.
				const existing = map.get(key);

				// Add any new source URLs not already present.
				for (const [src_name, src_url] of Object.entries(item.sources))
				{
					if (!(src_name in existing.sources)) existing.sources[src_name] = src_url;
				}

				// Use the first cover we find.
				if (!existing.cover && item.cover) existing.cover = item.cover;

				// Always keep the highest max_chapter seen across all sources.
				if (item.max_chapter !== null && item.max_chapter !== undefined)
				{
					if (
						existing.max_chapter === null ||
						existing.max_chapter === undefined ||
						item.max_chapter > existing.max_chapter
					) {
						existing.max_chapter = item.max_chapter;
					}
				}

				// Merge status: use the highest-priority value.
				existing.status = merge_status(existing.status, item.status);

				// Merge per-source chapter lists.
				// A null sentinel means "this source had no changes -- keep the
				// existing chapter list from the previous chunk".  We honour that
				// here during the in-memory merge so the eventual chunk write is
				// also correct.
				if (item.chapters)
				{
					if (!existing.chapters) existing.chapters = {};
					for (const [src_name, ch_list] of Object.entries(item.chapters))
					{
						// null sentinel: skip -- do not overwrite existing data.
						if (ch_list === null) continue;
						if (!(src_name in existing.chapters)) existing.chapters[src_name] = ch_list;
					}
				}

				// Copy any source-specific fields (e.g. demonic_id, flame_series_id)
				// that are not already on the existing entry.
				for (const [field, value] of Object.entries(item))
				{
					if (!['title', 'slug', 'cover', 'status', 'sources', 'chapters', 'max_chapter', 'chapter_count'].includes(field) && existing[field] === undefined)
					{
						existing[field] = value;
					}
				}
			}
			else
			{
				// New series -- add it to the map (without the scraper-internal slug field).
				const { slug, chapter_count, ...rest } = item;
				if (!('max_chapter' in rest)) rest.max_chapter = null;
				if (!('chapters'    in rest)) rest.chapters    = {};
				if (!('status'      in rest)) rest.status      = null;

				// Resolve null sentinels in chapters for brand-new entries.
				for (const src of Object.keys(rest.chapters))
				{
					if (rest.chapters[src] === null) rest.chapters[src] = [];
				}

				map.set(key, rest);
			}
		}
	}

	return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

// ── Build updated state from merged data ──────────────────────────────────────

// Build the new scrape_state from the merged series list and the per-source
// raw lists (so we can record per-source chapter counts used for incremental checks).
// state_key for HTML scrapers is the series slug; for API scrapers it is the
// normalised title (since slugs may not be unique across sources).
function build_state(merged, raw_lists_by_name)
{
	const state = {};

	// Index raw lists by title-key for fast lookup.
	const raw_by_key = {};
	for (const [src_name, list] of Object.entries(raw_lists_by_name))
	{
		for (const item of list)
		{
			if (!item.title) continue;
			const key = normalise(item.title);
			if (!raw_by_key[key]) raw_by_key[key] = {};
			raw_by_key[key][src_name] = item;
		}
	}

	for (const series of merged)
	{
		const key  = normalise(series.title);
		const raw  = raw_by_key[key] || {};

		// chapter_count: the value from whichever API source scraped this series.
		// Used by Asura/Flame/Temple quick-mode to detect new chapters without
		// fetching every series page.  HTML scrapers compare max_chapter instead.
		let chapter_count = null;
		for (const src of ['Asura Scans', 'Flame Comics', 'Temple Toons'])
		{
			const r = raw[src];
			if (r && r.chapter_count != null)
			{
				if (chapter_count === null || r.chapter_count > chapter_count)
					chapter_count = r.chapter_count;
			}
		}

		const entry = { status: series.status || null, max_chapter: series.max_chapter ?? null };
		if (chapter_count !== null) entry.chapter_count = chapter_count;

		state[key] = entry;
	}

	// Also record HTML-scraper slug-keyed entries for quick-mode lookups.
	// These are used by demonic/thunder/violet/adk to compare max_chapter by slug.
	for (const [src_name, list] of Object.entries(raw_lists_by_name))
	{
		for (const item of list)
		{
			if (!item.slug) continue;
			// Only add if slug differs from the title key (i.e. it's a real path slug).
			if (item.slug === normalise(item.title)) continue;
			if (state[item.slug]) continue; // already written
			state[item.slug] =
			{
				max_chapter: item.max_chapter ?? null,
				status:      item.status      || null,
			};
		}
	}

	return state;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main()
{
	console.log(`=== MangaLink Scraper (mode=${IS_QUICK ? 'quick' : 'deep'}) ===`);
	const start_time = Date.now();

	// Load previous run's state so scrapers can do incremental checks.
	const prev_state = load_state();
	console.log(`Loaded state: ${Object.keys(prev_state).length} entries`);

	// Pass per-source state slices to each scraper.
	// HTML scrapers (demonic/thunder/violet/adk) receive the full state map
	// because they key by slug.  API scrapers (asura/flame/temple) use title
	// keys internally and receive the same full map.
	const common_opts =
	{
		state:        prev_state,
		is_quick:     IS_QUICK,
		req_delay_ms: IS_QUICK ? 0 : DEEP_REQ_DELAY_MS,
	};

	// Run all scrapers in parallel. allSettled means a failing scraper
	// is logged as an error but does not prevent the others from completing.
	const results = await Promise.allSettled(
		[
			scrape_adk(common_opts),
			scrape_asura(common_opts),
			scrape_demonic(common_opts),
			scrape_temple_toons(common_opts),
			scrape_thunder(common_opts),
			scrape_flame(common_opts),
			scrape_violet(common_opts),
		]
	);

	// Labels aligned with the results array order above.
	const names = ['ADK', 'Asura', 'Demonic', 'Temple', 'Thunder', 'Flame', 'Violet'];

	const lists            = [];
	const raw_by_name      = {};

	for (let i = 0; i < results.length; i++)
	{
		if (results[i].status === 'fulfilled')
		{
			lists.push(results[i].value);
			raw_by_name[names[i]] = results[i].value;
			console.log(`${names[i]}: ${results[i].value.length} series`);
		}
		else
		{
			console.error(`${names[i]} FAILED:`, results[i].reason);
			lists.push([]);
			raw_by_name[names[i]] = [];
		}
	}

	// Map scraper label -> canonical source name for build_state().
	const LABEL_TO_SRC =
	{
		ADK:     'ADK Scans',
		Asura:   'Asura Scans',
		Demonic: 'Demonic Scans',
		Temple:  'Temple Toons',
		Thunder: 'Thunder Scans',
		Flame:   'Flame Comics',
		Violet:  'Violet Scans',
	};
	const raw_by_src_name = {};
	for (const [label, list] of Object.entries(raw_by_name))
	{
		raw_by_src_name[LABEL_TO_SRC[label]] = list;
	}

	const merged = merge(lists);
	console.log(`\nTotal after merge: ${merged.length} unique series`);

	// Print per-source series counts.
	const source_counts = {};
	for (const series of merged)
	{
		for (const src_name of Object.keys(series.sources))
		{
			source_counts[src_name] = (source_counts[src_name] || 0) + 1;
		}
	}
	console.log('\nSeries per source:');
	for (const [src, count] of Object.entries(source_counts).sort())
	{
		console.log(`   ${src}: ${count}`);
	}

	// Status distribution.
	const status_counts = {};
	for (const s of merged)
	{
		const k = s.status || 'null';
		status_counts[k] = (status_counts[k] || 0) + 1;
	}
	console.log('\nStatus distribution:');
	for (const [k, v] of Object.entries(status_counts).sort())
	{
		console.log(`   ${k}: ${v}`);
	}

	// Coverage stats.
	const with_chapter  = merged.filter(s => s.max_chapter !== null && s.max_chapter !== undefined);
	const with_chapters = merged.filter(s => s.chapters && Object.keys(s.chapters).length > 0);
	console.log(`\nmax_chapter populated: ${with_chapter.length}/${merged.length} series`);
	console.log(`chapters populated:     ${with_chapters.length}/${merged.length} series`);

	// Create output directories if they do not exist.
	if (!fs.existsSync(OUT_DIR))    fs.mkdirSync(OUT_DIR,    { recursive: true });
	if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });

	// Single-char source codes used in the index to reduce file size.
	const SRC_CODE =
	{
		'Asura Scans':   'A',
		'ADK Scans':     'D',
		'Thunder Scans': 'T',
		'Temple Toons':  'P',
		'Demonic Scans': 'M',
		'Flame Comics':  'F',
		'Violet Scans':  'V',
	};

	const CHUNK_SIZE = 1000;

	// Build the lightweight index. Each entry stores just what the search UI needs.
	// i = position within the chunk (global_i % CHUNK_SIZE), NOT the global index.
	const index = merged.map((s, global_i) => ({
		i:   global_i % CHUNK_SIZE,
		t:   s.title,
		c:   s.cover   || null,
		s:   s.status  || null,
		src: Object.keys(s.sources || {}).map(n => SRC_CODE[n] || n),
		m:   s.max_chapter ?? null,
		k:   Math.floor(global_i / CHUNK_SIZE),
	}));

	fs.writeFileSync(
		path.join(OUT_DIR, 'index.json'),
		JSON.stringify(index, null, 1),   // minified -- size matters here
		'utf8'
	);
	console.log(`\nWrote index.json with ${index.length} entries`);

	// Write chunk files -- full series data split into groups of CHUNK_SIZE.
	const n_chunks = Math.ceil(merged.length / CHUNK_SIZE);

	// In quick mode we patch existing chunks rather than rewriting every file.
	// For each chunk we load the existing file (if any), apply updates for
	// series that changed, and only write the file if something actually changed.
	for (let k = 0; k < n_chunks; k++)
	{
		const chunk_file = path.join(CHUNKS_DIR, `chunk_${k}.json`);
		const new_slice  = merged.slice(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE);

		if (IS_QUICK && fs.existsSync(chunk_file))
		{
			// Load existing chunk and apply changes.
			// We match by title rather than array position so that newly-added
			// series (which shift positions after the insertion point) never
			// cause a series to be patched with another series' data.
			let existing_chunk;
			try
			{
				existing_chunk = JSON.parse(fs.readFileSync(chunk_file, 'utf8'));
			}
			catch (e)
			{
				console.warn(`[Chunks] Could not parse ${chunk_file}, rewriting.`);
				existing_chunk = null;
			}

			if (existing_chunk)
			{
				// Build a title → index map for O(1) lookups into the existing chunk.
				const existing_by_title = new Map();
				for (let j = 0; j < existing_chunk.length; j++)
				{
					if (existing_chunk[j].title) existing_by_title.set(existing_chunk[j].title, j);
				}

				let changed = false;

				for (const incoming of new_slice)
				{
					const ej = existing_by_title.get(incoming.title);
					const existing = ej !== undefined ? existing_chunk[ej] : null;

					// Preserve existing chapter lists for sources that returned null sentinel.
					if (incoming.chapters)
					{
						for (const src of Object.keys(incoming.chapters))
						{
							if (incoming.chapters[src] === null)
							{
								incoming.chapters[src] = (existing && existing.chapters && existing.chapters[src]) || [];
							}
						}
					}
				}

				// Rebuild the chunk array from new_slice (correct positions for new series).
				// Compare each entry against the old position (if it existed) for change detection.
				for (const incoming of new_slice)
				{
					const ej      = existing_by_title.get(incoming.title);
					const old_str = ej !== undefined ? JSON.stringify(existing_chunk[ej]) : null;
					if (old_str !== JSON.stringify(incoming)) changed = true;
				}

				if (changed)
				{
					fs.writeFileSync(chunk_file, JSON.stringify(new_slice, null, 1), 'utf8');
					console.log(`Updated chunk_${k}.json`);
				}
				else
				{
					console.log(`Chunk ${k} unchanged -- skipped write.`);
				}
				continue;
			}
		}

		// Deep mode or chunk doesn't exist yet: write it fresh.
		// Resolve any remaining null sentinels to empty arrays.
		for (const series of new_slice)
		{
			if (series.chapters)
			{
				for (const src of Object.keys(series.chapters))
				{
					if (series.chapters[src] === null) series.chapters[src] = [];
				}
			}
		}

		fs.writeFileSync(chunk_file, JSON.stringify(new_slice, null, 1), 'utf8');
	}
	console.log(`Wrote/updated ${n_chunks} chunk files -> data/chunks/chunk_0..${n_chunks - 1}.json`);

	// Update and save state.
	const new_state = build_state(merged, raw_by_src_name);
	save_state(new_state);

	const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
	console.log(`=== Done in ${elapsed}s ===`);
	process.exit(0);
}

main().catch(err =>
{
	console.error('Fatal error:', err);
	process.exit(1);
});
