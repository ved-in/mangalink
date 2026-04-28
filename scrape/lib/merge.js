const fs   = require('fs');
const path = require('path');
const { normalise_title, merge_status } = require('./helpers');

const CHUNKS_DIR = path.join(__dirname, '..', '..', 'data', 'chunks');

function load_existing_chunks()
{
	const map = new Map();
	if (!fs.existsSync(CHUNKS_DIR)) return map;
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

function merge(lists, existing)
{
	const map = new Map(existing);

	for (const list of lists)
	{
		for (const item of list)
		{
			if (!item.title || !item.title.trim())
			{
				console.warn(`[merge] Skipping entry with empty title (slug: ${item.slug ?? 'unknown'})`);
				continue;
			}

			const key = normalise_title(item.title);

			if (map.has(key))
			{
				const entry = map.get(key);
				for (const [src, url] of Object.entries(item.sources || {}))
				{
					if (!(src in entry.sources)) entry.sources[src] = url;
				}
				if (!entry.cover && item.cover) entry.cover = item.cover;
				if (item.max_chapter != null &&
					(entry.max_chapter == null || item.max_chapter > entry.max_chapter))
				{
					entry.max_chapter = item.max_chapter;
				}
				entry.status = merge_status(entry.status, item.status);
				if (item.ua)
				{
					if (!entry.ua || item.ua > entry.ua) entry.ua = item.ua;
				}
				if (item.uf != null)
				{
					if (entry.uf == null || item.uf > entry.uf) entry.uf = item.uf;
				}
				if (item.chapters)
				{
					if (!entry.chapters) entry.chapters = {};
					for (const [src, ch_list] of Object.entries(item.chapters))
					{
						if (ch_list !== null) entry.chapters[src] = ch_list;
					}
				}
				const RESERVED = new Set(['title', 'slug', 'cover', 'status', 'sources',
				                          'chapters', 'max_chapter', 'chapter_count', 'ua', 'uf']);
				for (const [field, value] of Object.entries(item))
				{
					if (!RESERVED.has(field) && entry[field] === undefined)
						entry[field] = value;
				}
			}
			else
			{
				const { slug, ...rest } = item;

				if (!('max_chapter' in rest)) rest.max_chapter = null;
				if (!('chapters'    in rest)) rest.chapters    = {};
				if (!('status'      in rest)) rest.status      = null;
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

module.exports = { load_existing_chunks, merge };
