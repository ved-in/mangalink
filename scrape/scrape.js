/**
 * scrape/scrape.js  --  Main entry point
 *
 * Run with:
 *   node scrape/scrape.js
 *
 * This file is only the orchestrator. It:
 *   1. Loads the previous-run state from data/scrape_state.json
 *   2. Runs all scrapers in parallel (each scraper handles its own rate-limiting)
 *   3. Merges results on top of the existing chunk data
 *   4. Writes data/index.json, data/chunks/chunk_N.json, data/scrape_state.json
 *
 * All scraping logic lives in sources/{site}/. Shared utilities are in lib/.
 * See each scraper's index.js for a description of how that site is scraped.
 *
 * ── Output files ─────────────────────────────────────────────────────────────
 *
 *   data/index.json
 *     Lightweight array used by the search UI. One small object per series:
 *     { i, t, c, s, src, m, k }
 *       i   -- index within its chunk  (global_index % CHUNK_SIZE)
 *       t   -- title
 *       c   -- cover URL or null
 *       s   -- status string or null
 *       src -- array of single-char source codes (see SRC_CODE below)
 *       m   -- max_chapter or null
 *       k   -- chunk number  (Math.floor(global_index / CHUNK_SIZE))
 *
 *   data/chunks/chunk_N.json
 *     Full series data, 1000 entries per file. The front-end fetches only the
 *     chunk for the series the user clicked on. Chunks are patched in-place
 *     rather than rewritten entirely to minimise CI diff noise.
 *
 *   data/scrape_state.json
 *     Per-series metadata from the last run. Used as the comparison baseline
 *     for the next run's incremental checks. See lib/state.js for the schema.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// Scrapers
const { scrape_adk }          = require('./sources/adk');
const { scrape_asura }        = require('./sources/asura');
const { scrape_demonic }      = require('./sources/demonic');
const { scrape_temple_toons } = require('./sources/temple');
const { scrape_thunder }      = require('./sources/thunder');
const { scrape_flame }        = require('./sources/flame');
const { scrape_violet }       = require('./sources/violet');

// Shared utilities
const { load_state, save_state, build_state } = require('./lib/state');
const { load_existing_chunks, merge }         = require('./lib/merge');

// ── Paths ─────────────────────────────────────────────────────────────────────

const OUT_DIR    = path.join(__dirname, '..', 'data');
const CHUNKS_DIR = path.join(OUT_DIR, 'chunks');

// ── Source codes (single char each, keeps index.json small) ──────────────────

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

// ── Chunk writing ─────────────────────────────────────────────────────────────

/**
 * Write chunk files from the merged series array.
 *
 * We patch existing chunks rather than rewriting every file on every run.
 * Strategy:
 *   - If the chunk file already exists, load it, resolve null sentinels using
 *     the stored data, compare entry-by-entry, and only write if something changed.
 *   - If the chunk file doesn't exist yet, write it fresh.
 *
 * Null sentinels (chapters[src] === null) mean "keep whatever was stored for
 * this source last time". We resolve them here rather than in merge() so that
 * the in-memory merged array never has stale chapter data baked in.
 *
 * @param {Array} merged   The full sorted series list from merge().
 */
function write_chunks(merged)
{
	if (!fs.existsSync(OUT_DIR))    fs.mkdirSync(OUT_DIR,    { recursive: true });
	if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });

	const CHUNK_SIZE = 1000;
	const n_chunks   = Math.ceil(merged.length / CHUNK_SIZE);

	for (let k = 0; k < n_chunks; k++)
	{
		const chunk_file = path.join(CHUNKS_DIR, `chunk_${k}.json`);
		const new_slice  = merged.slice(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE);

		if (fs.existsSync(chunk_file))
		{
			// ── Patch existing chunk ──────────────────────────────────────────
			let existing_chunk = null;
			try
			{
				existing_chunk = JSON.parse(fs.readFileSync(chunk_file, 'utf8'));
			}
			catch (e)
			{
				console.warn(`[Chunks] Could not parse chunk_${k}.json, rewriting.`);
			}

			if (existing_chunk)
			{
				// Build a title→index map for O(1) lookups into the existing array.
				const existing_by_title = new Map(
					existing_chunk
						.filter(s => s.title)
						.map((s, j) => [s.title, j])
				);

				// Resolve null sentinels using the stored chapter lists.
				for (const series of new_slice)
				{
					if (!series.chapters) continue;
					const old_j      = existing_by_title.get(series.title);
					const old_series = old_j != null ? existing_chunk[old_j] : null;

					for (const src of Object.keys(series.chapters))
					{
						if (series.chapters[src] !== null) continue;
						series.chapters[src] = (old_series?.chapters?.[src]) || [];
					}
				}

				// Only write the file if at least one entry changed.
				let changed = false;
				for (const incoming of new_slice)
				{
					const old_j   = existing_by_title.get(incoming.title);
					const old_str = old_j != null ? JSON.stringify(existing_chunk[old_j]) : null;
					if (old_str !== JSON.stringify(incoming)) { changed = true; break; }
				}

				if (!fs.existsSync(OUT_DIR))
				{
					fs.mkdirSync(OUT_DIR, { recursive: true });
				}

				if (changed)
				{
					fs.writeFileSync(chunk_file, JSON.stringify(new_slice, null, 1), 'utf8');
					console.log(`Updated chunk_${k}.json`);
				}
				else
				{
					console.log(`Chunk ${k} unchanged -- skipped.`);
				}
				continue;
			}
		}

		// ── Write fresh chunk ─────────────────────────────────────────────────
		for (const series of new_slice)
		{
			if (!series.chapters) continue;
			for (const src of Object.keys(series.chapters))
			{
				if (series.chapters[src] === null) series.chapters[src] = [];
			}
		}

		fs.writeFileSync(chunk_file, JSON.stringify(new_slice, null, 1), 'utf8');
		console.log(`Wrote chunk_${k}.json`);
	}

	console.log(`Wrote/updated ${n_chunks} chunk files -> data/chunks/chunk_0..${n_chunks - 1}.json`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main()
{
	console.log('=== MangaLink Scraper ===');
	const start_time = Date.now();

	const prev_state = load_state();
	console.log(`Loaded state: ${Object.keys(prev_state).length} entries`);

	const common_opts = { state: prev_state };

	// ── Run all scrapers in parallel ──────────────────────────────────────────
	// allSettled() means a failing scraper is logged but doesn't stop the others.

	const SCRAPERS =
	[
		{ name: 'ADK',     label: 'ADK Scans',     fn: scrape_adk          },
		{ name: 'Asura',   label: 'Asura Scans',   fn: scrape_asura        },
		{ name: 'Demonic', label: 'Demonic Scans',  fn: scrape_demonic      },
		{ name: 'Temple',  label: 'Temple Toons',   fn: scrape_temple_toons },
		{ name: 'Thunder', label: 'Thunder Scans',  fn: scrape_thunder      },
		{ name: 'Flame',   label: 'Flame Comics',   fn: scrape_flame        },
		{ name: 'Violet',  label: 'Violet Scans',   fn: scrape_violet       },
	];

	const results = await Promise.allSettled(
		SCRAPERS.map(s => s.fn(common_opts))
	);

	const lists      = [];
	const raw_by_src = {};

	for (let i = 0; i < results.length; i++)
	{
		const { name, label } = SCRAPERS[i];
		const result          = results[i];

		if (result.status === 'fulfilled')
		{
			lists.push(result.value);
			raw_by_src[label] = result.value;
			console.log(`${name}: ${result.value.length} series`);
		}
		else
		{
			console.error(`${name} FAILED:`, result.reason);
			lists.push([]);
			raw_by_src[label] = [];
		}
	}

	// ── Merge and write ───────────────────────────────────────────────────────

	const merged = merge(lists, load_existing_chunks());
	console.log(`\nTotal after merge: ${merged.length} unique series`);

	// Per-source series counts.
	const source_counts = {};
	for (const series of merged)
	{
		for (const src of Object.keys(series.sources || {}))
			source_counts[src] = (source_counts[src] || 0) + 1;
	}
	console.log('\nSeries per source:');
	for (const [src, count] of Object.entries(source_counts).sort())
		console.log(`   ${src}: ${count}`);

	// Status distribution.
	const status_counts = {};
	for (const s of merged)
	{
		const k = s.status || 'null';
		status_counts[k] = (status_counts[k] || 0) + 1;
	}
	console.log('\nStatus distribution:');
	for (const [k, v] of Object.entries(status_counts).sort())
		console.log(`   ${k}: ${v}`);

	// Coverage sanity check.
	const with_chapter  = merged.filter(s => s.max_chapter != null);
	const with_chapters = merged.filter(s => s.chapters && Object.keys(s.chapters).length > 0);
	console.log(`\nmax_chapter populated: ${with_chapter.length}/${merged.length} series`);
	console.log(`chapters populated:     ${with_chapters.length}/${merged.length} series`);

	// Write index.json.
	const index = merged.map((s, gi) => ({
		i:   gi % 1000,
		t:   s.title,
		c:   s.cover  || null,
		s:   s.status || null,
		src: Object.keys(s.sources || {}).map(n => SRC_CODE[n] || n),
		m:   s.max_chapter ?? null,
		k:   Math.floor(gi / 1000),
	}));

	if (!fs.existsSync(OUT_DIR)) {
		fs.mkdirSync(OUT_DIR, { recursive: true });
	}

	fs.writeFileSync(
		path.join(OUT_DIR, 'index.json'),
		JSON.stringify(index, null, 1),
		'utf8'
	);
	console.log(`\nWrote index.json with ${index.length} entries`);

	write_chunks(merged);
	save_state(build_state(merged, raw_by_src));

	const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
	console.log(`=== Done in ${elapsed}s ===`);
	process.exit(0);
}

main().catch(err =>
{
	console.error('Fatal error:', err);
	process.exit(1);
});
