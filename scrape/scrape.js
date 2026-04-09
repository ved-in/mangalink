/**
Manga metadata scraper (title, slug, cover, sources)

- ADK Scans: Its paginated. Goes through all the pages and finds chapters through regex (WEIRDDDDDDDD HTML)
- Asura Scans: Like I've said before... Asura IS THE GOATT. LITERALLY AN API!!! RAHHHHHHHHHHH
- Demonic Scans: Paginated like ADK Scans. prettyy easy
- Temple Scans: Weird ahhhh json
- Thunder Scans: Paginated. Phewwwwwwww
*/

const fs = require('fs');
const path = require('path');

const { scrape_asura } = require('./sources/asura');
const { scrape_thunder } = require('./sources/thunder');
const { scrape_adk } = require('./sources/adk');
const { scrape_demonic } = require('./sources/demonic');
const { scrape_temple_toons } = require('./sources/temple');
const { scrape_flame } = require('./sources/flame');


function normalise(title)
{
	return title.toLowerCase()
		.normalize('NFKD')			// "Pokémon" will be converted to "Poke\u0301mon"
		.replace(/[^\w\s]/g, '')	// Removes EVERY non-word char like () [] ' " \u0301 etc. EXCLUDING whitespaces
		.replace(/\s+/g, ' ')		// Collapses any sequence of whitespace to just a single whitespacce
		.trim();
}

function merge(lists)
{
	const map = new Map();

	for (const list of lists)
	{
		for (const item of list)
		{
			const key = normalise(item.title);
			if (map.has(key))
			{
				const existing = map.get(key);
				for (const src of item.sources)
				{
					if (!existing.sources.includes(src)) existing.sources.push(src);
				}
				if (!existing.cover && item.cover) existing.cover = item.cover;

				for (const [field, value] of Object.entries(item))
				{
                    if (!['title', 'slug', 'cover', 'sources'].includes(field) && existing[field] === undefined) {
                        existing[field] = value;
                    }
                }
			}
			else
			{
				const { slug, ...rest } = item;
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

	const results = await Promise.allSettled(
		[
			scrape_adk(),
			scrape_asura(),
			scrape_demonic(),
			scrape_temple_toons(),
			scrape_thunder(),
			scrape_flame(),
		]
	);

	const lists = [];
	const names = [
		'ADK',
		'Asura',
		'Demonic',
		'Temple',
		'Thunder',
		'Flame'
	];

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

	const source_counts = {};
	for (const series of merged)
	{
		for (const src of series.sources)
		{
			source_counts[src] = (source_counts[src] || 0) + 1;
		}
	}

	console.log('\nSeries per source:');
	for (const [src, count] of Object.entries(source_counts).sort())
	{
		console.log(`   ${src}: ${count}`);
	}

	const out_dir = path.join(__dirname, '..', 'data');
	const out_file = path.join(out_dir, 'series.json');

	if (!fs.existsSync(out_dir)) fs.mkdirSync(out_dir, { recursive: true });

	fs.writeFileSync(out_file, JSON.stringify(merged, null, 4), 'utf8');
	console.log(`\nWrote ${out_file}`);

	const elapsed = ((Date.now() - start_time) / 1000).toFixed(1);
	console.log(`=== Done in ${elapsed}s ===`);
}


main().catch(
	err => {
		console.error('Fatal error:', err);
		process.exit(1);
	}
);
