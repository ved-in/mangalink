/**
 * scrape/scrape.js
 *
 * Main scraper entry point. Run with: node scrape/scrape.js
 * Executed by GitHub Actions on a schedule to keep the data fresh.
 *
 * WHAT IT DOES:
 *   1. Runs all source scrapers in parallel (Promise.allSettled so one
 *      failing source does not abort the others).
 *   2. Merges the results into a single deduplicated list, sorted alphabetically.
 *   3. Writes two outputs to data/:
 *        data/index.json          -- lightweight search index (~2MB)
 *        data/chunks/chunk_N.json -- full series data in groups of 1000 (~400KB each)
 *
 * WHY TWO OUTPUTS?
 *   The old approach wrote one series.json (~10MB) that was downloaded on every
 *   first search. Splitting into an index + chunks means:
 *     - Search loads only index.json (much smaller).
 *     - Full chapter data is fetched per-chunk only when a user clicks a manga.
 *     - Chunks are cached client-side, so repeat clicks in the same chunk are instant.
 *
 * INDEX ENTRY SHAPE:
 *   { i, t, c, s, src, m, k }
 *     i   -- position within its chunk (global_index % CHUNK_SIZE)
 *     t   -- title
 *     c   -- cover URL
 *     s   -- status string
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

const { scrape_asura }       = require('./sources/asura');
const { scrape_thunder }     = require('./sources/thunder');
const { scrape_adk }         = require('./sources/adk');
const { scrape_demonic }     = require('./sources/demonic');
const { scrape_temple_toons } = require('./sources/temple');
const { scrape_flame }       = require('./sources/flame');
const { scrape_violet }      = require('./sources/violet');

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
			if (!item.title || !item.title.trim()) {
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

				// Merge per-source chapter lists (each source keeps its own).
				if (item.chapters)
				{
					if (!existing.chapters) existing.chapters = {};
					for (const [src_name, ch_list] of Object.entries(item.chapters))
					{
						if (!(src_name in existing.chapters)) existing.chapters[src_name] = ch_list;
					}
				}

				// Copy any source-specific fields (e.g. demonic_id, flame_series_id)
				// that are not already on the existing entry.
				for (const [field, value] of Object.entries(item))
				{
					if (!['title', 'slug', 'cover', 'sources', 'chapters', 'max_chapter'].includes(field) && existing[field] === undefined) {
						existing[field] = value;
					}
				}
			}
			else
			{
				// New series -- add it to the map (without the scraper-internal slug field).
				const { slug, ...rest } = item;
				if (!('max_chapter' in rest)) rest.max_chapter = null;
				if (!('chapters'    in rest)) rest.chapters    = {};
				map.set(key, rest);
			}
		}
	}

	return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

async function main()
{
	console.log('=== MangaLink Scraper ===');
	const start_time = Date.now();

	// Run all scrapers in parallel. allSettled means a failing scraper
	// is logged as an error but does not prevent the others from completing.
	const results = await Promise.allSettled(
		[
			scrape_adk(),
			scrape_asura(),
			scrape_demonic(),
			scrape_temple_toons(),
			scrape_thunder(),
			scrape_flame(),
			scrape_violet(),
		]
	);

	// Labels aligned with the results array order above.
	const names = ['ADK', 'Asura', 'Demonic', 'Temple', 'Thunder', 'Flame', 'Violet'];

	const lists = [];
	for (let i = 0; i < results.length; i++)
	{
		if (results[i].status === 'fulfilled')
		{
			lists.push(results[i].value);
			console.log(`${names[i]}: ${results[i].value.length} series`);
		}
		else
		{
			console.error(`${names[i]} FAILED:`, results[i].reason);
			lists.push([]);
		}
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

	// Coverage stats.
	const with_chapter  = merged.filter(s => s.max_chapter !== null && s.max_chapter !== undefined);
	const with_chapters = merged.filter(s => s.chapters && Object.keys(s.chapters).length > 0);
	console.log(`\nmax_chapter populated: ${with_chapter.length}/${merged.length} series`);
	console.log(`chapters populated:     ${with_chapters.length}/${merged.length} series`);

	// Create output directories if they do not exist.
	const out_dir    = path.join(__dirname, '..', 'data');
	const chunks_dir = path.join(out_dir, 'chunks');
	if (!fs.existsSync(out_dir))    fs.mkdirSync(out_dir,    { recursive: true });
	if (!fs.existsSync(chunks_dir)) fs.mkdirSync(chunks_dir, { recursive: true });

	// Single-char source codes used in the index to reduce file size.
	const SRC_CODE = {
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
		path.join(out_dir, 'index.json'),
		JSON.stringify(index, null, 1),   // minified -- size matters here
		'utf8'
	);
	console.log(`\nWrote index.json with ${index.length} entries)`);

	// Write chunk files -- full series data split into groups of CHUNK_SIZE.
	const n_chunks = Math.ceil(merged.length / CHUNK_SIZE);
	for (let k = 0; k < n_chunks; k++) {
		const chunk      = merged.slice(k * CHUNK_SIZE, (k + 1) * CHUNK_SIZE);
		const chunk_file = path.join(chunks_dir, `chunk_${k}.json`);
		fs.writeFileSync(chunk_file, JSON.stringify(chunk, null, 1), 'utf8');
	}
	console.log(`Wrote ${n_chunks} chunk files -> data/chunks/chunk_0..${n_chunks - 1}.json`);

	const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
	console.log(`=== Done in ${elapsed}s ===`);
	process.exit(0);
}

main().catch(err => {
	console.error('Fatal error:', err);
	process.exit(1);
});
