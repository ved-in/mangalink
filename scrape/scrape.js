'use strict';

const fs   = require('fs');
const path = require('path');
const { scrape_adk }          = require('./sources/adk');
const { scrape_asura }        = require('./sources/asura');
const { scrape_demonic }      = require('./sources/demonic');
const { scrape_temple_toons } = require('./sources/temple');
const { scrape_thunder }      = require('./sources/thunder');
const { scrape_flame }        = require('./sources/flame');
const { scrape_violet }       = require('./sources/violet');
const { scrape_mangaplus }    = require('./sources/mangaplus');
const { load_state, save_state, build_state } = require('./lib/state');
const { load_existing_chunks, merge }         = require('./lib/merge');

const OUT_DIR    = path.join(__dirname, '..', 'data');
const CHUNKS_DIR = path.join(OUT_DIR, 'chunks');

const SRC_CODE =
{
	'Asura Scans':   'A',
	'ADK Scans':     'D',
	'Thunder Scans': 'T',
	'Temple Toons':  'P',
	'Demonic Scans': 'M',
	'Flame Comics':  'F',
	'Violet Scans':  'V',
	'MangaPlus':     'J',
};

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
				const existing_by_title = new Map(
					existing_chunk
						.filter(s => s.title)
						.map((s, j) => [s.title, j])
				);
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

async function main()
{
	console.log('=== MangaLink Scraper ===');
	const start_time = Date.now();
	const status_only = process.argv.includes('--status-only');
	if (status_only) console.log('Mode: --status-only (full catalogue status/cover scan)');

	const { entries: prev_state, run: prev_run, status_run: prev_status_run } = load_state();
	console.log(`Loaded state: ${Object.keys(prev_state).length} entries, prev_run=${prev_run}`);
	const run        = prev_run + 1;
	const status_run = status_only ? prev_status_run + 1 : prev_status_run;
	console.log(`Run counter: ${run}${status_only ? ` (status_run: ${status_run})` : ''}`);

	const common_opts = { state: prev_state, run, status_only };

	const SCRAPERS =
	[
		{ name: 'ADK',     label: 'ADK Scans',     fn: scrape_adk          },
		{ name: 'Asura',   label: 'Asura Scans',   fn: scrape_asura        },
		{ name: 'Demonic', label: 'Demonic Scans',  fn: scrape_demonic      },
		{ name: 'Temple',  label: 'Temple Toons',   fn: scrape_temple_toons },
		{ name: 'Thunder', label: 'Thunder Scans',  fn: scrape_thunder      },
		{ name: 'Flame',   label: 'Flame Comics',   fn: scrape_flame        },
		{ name: 'Violet',  label: 'Violet Scans',   fn: scrape_violet       },
		{ name: 'MangaPlus', label: 'MangaPlus',     fn: scrape_mangaplus  },
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

	const merged = merge(lists, load_existing_chunks());
	console.log(`\nTotal after merge: ${merged.length} unique series`);
	const source_counts = {};
	for (const series of merged)
	{
		for (const src of Object.keys(series.sources || {}))
			source_counts[src] = (source_counts[src] || 0) + 1;
	}
	console.log('\nSeries per source:');
	for (const [src, count] of Object.entries(source_counts).sort())
		console.log(`   ${src}: ${count}`);
	const status_counts = {};
	for (const s of merged)
	{
		const k = s.status || 'null';
		status_counts[k] = (status_counts[k] || 0) + 1;
	}
	console.log('\nStatus distribution:');
	for (const [k, v] of Object.entries(status_counts).sort())
		console.log(`   ${k}: ${v}`);
	const with_chapter  = merged.filter(s => s.max_chapter != null);
	const with_chapters = merged.filter(s => s.chapters && Object.keys(s.chapters).length > 0);
	const with_ua       = merged.filter(s => s.ua != null);
	const with_uf       = merged.filter(s => s.uf != null);
	console.log(`\nmax_chapter populated: ${with_chapter.length}/${merged.length} series`);
	console.log(`chapters populated:     ${with_chapters.length}/${merged.length} series`);
	console.log(`ua populated:           ${with_ua.length}/${merged.length} series`);
	console.log(`uf populated:           ${with_uf.length}/${merged.length} series`);
	const index = merged.map((s, gi) => ({
		i:   gi % 1000,
		t:   s.title,
		c:   s.cover  || null,
		s:   s.status || null,
		src: Object.keys(s.sources || {}).map(n => SRC_CODE[n] || n),
		m:   s.max_chapter ?? null,
		k:   Math.floor(gi / 1000),
		ua:  s.ua || null,
		uf:  s.uf ?? null,
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
	save_state(build_state(merged, raw_by_src), run, status_run);

	const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
	console.log(`=== Done in ${elapsed}s ===`);
	process.exit(0);
}

main().catch(err =>
{
	console.error('Fatal error:', err);
	process.exit(1);
});
