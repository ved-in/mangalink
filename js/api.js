/*
 * api.js
 *
 * Handles all data loading for the front-end.
 *
 * WHY TWO FILES INSTEAD OF ONE BIG JSON?
 * The old approach loaded all ~13,000 series into one series.json (~10MB) on
 * every first search. That is slow and wastes memory. Instead we now use:
 *
 *   data/index.json          (~2MB)
 *     One small entry per series. Contains just enough to run a search and
 *     render a result card (title, cover, status, source names, max_chapter).
 *     Loaded once on the first search, then kept in memory forever.
 *
 *   data/chunks/chunk_N.json (~400KB each)
 *     Full series data (chapter lists, source URLs, etc.) split into groups
 *     of 1000 entries. Only fetched when a user clicks a manga to see its
 *     chapters. Once fetched, a chunk is cached in memory so clicking two
 *     manga from the same chunk only ever triggers one network request.
 *
 * INDEX ENTRY SHAPE:
 *   { i, t, c, s, src, m, k }
 *     i   -- position within its chunk (0-999)
 *     t   -- title
 *     c   -- cover URL
 *     s   -- status string (e.g. "Ongoing")
 *     src -- array of source codes (A=Asura, D=ADK, T=Thunder, P=Temple, M=Demonic, F=Flame, V=Violet)
 *     m   -- max_chapter number
 *     k   -- chunk file number (loads data/chunks/chunk_k.json)
 *
 * MANGA OBJECT (returned by search_manga and used everywhere in the UI):
 *   id, title, cover, status, max_chapter  -- from the index entry
 *   sources     -- array of source name strings (e.g. ["Asura Scans", "ADK Scans"])
 *   source_urls -- dict of name -> URL, populated lazily on fetch_chapters()
 *   chapters    -- per-source chapter lists, populated lazily on fetch_chapters()
 *   flame_id    -- Flame Comics series ID, populated lazily on fetch_chapters()
 *   _chunk      -- which chunk file to load (internal, not shown in UI)
 *   _pos        -- position within that chunk (internal, not shown in UI)
 */

const API = (() => {

	// Maps single-char source codes (stored in index.json to save space) back to full names.
	const SRC_NAME = {
		A: 'Asura Scans',
		D: 'ADK Scans',
		T: 'Thunder Scans',
		P: 'Temple Toons',
		M: 'Demonic Scans',
		F: 'Flame Comics',
		V: 'Violet Scans',
	};

	let _index  = null;   // null until first search, then the full index array
	let _chunks = {};     // { [k]: full chunk array } -- grows as users click manga

	// Load index.json if not already loaded. Cached after first fetch.
	async function _load_index()
	{
		if (_index) return _index;
		const res = await fetch('data/index.json');
		if (!res.ok) throw new Error(`Failed to load index.json (HTTP ${res.status})`);
		_index = await res.json();
		return _index;
	}

	// Load a specific chunk file if not already cached.
	async function _load_chunk(k)
	{
		if (_chunks[k]) return _chunks[k];
		const res = await fetch(`data/chunks/chunk_${k}.json`);
		if (!res.ok) throw new Error(`Failed to load chunk_${k}.json (HTTP ${res.status})`);
		_chunks[k] = await res.json();
		return _chunks[k];
	}

	// Search for manga by title. Loads index.json on first call.
	// Scoring: exact match = 3, prefix match = 2, substring = 1.
	// Returns up to 10 results, sorted by score then alphabetically.
	async function search_manga(query)
	{
		const index = await _load_index();
		const q = _normalise(query);
		if (!q) return [];

		const scored = [];
		for (const entry of index)
		{
			const norm = _normalise(entry.t);
			let score = 0;
			if (norm === q)              score = 3;   // exact match
			else if (norm.startsWith(q)) score = 2;   // prefix match
			else if (norm.includes(q))   score = 1;   // substring match
			if (score > 0) scored.push({ score, entry });
		}

		return scored
			.sort((a, b) => b.score - a.score || a.entry.t.localeCompare(b.entry.t))
			.slice(0, 10)
			.map(({ entry }) => _parse_index_entry(entry));
	}

	// Fetch the full chapter list for a manga.
	// Loads the relevant chunk (if not cached), enriches the manga object with
	// source_urls and chapters, then builds and returns a sorted chapter array.
	async function fetch_chapters(manga)
	{
		// Load the chunk that contains this manga's full data.
		const chunk = await _load_chunk(manga._chunk);
		const full  = chunk[manga._pos];

		// Enrich the manga object in-place so source modules (asura.js, etc.)
		// have access to source_urls, chapters, and source-specific IDs.
		manga.source_urls = full.sources         || {};
		manga.chapters    = full.chapters        || {};
		manga.flame_id    = full.flame_series_id ?? null;
		manga.demonic_id  = full.demonic_id      ?? null;

		// Build a slug_map: { [chapter_number_string]: { [source_name]: chapter_slug } }
		// This is used later to look up the exact URL slug for a specific chapter on each source.
		const slug_map = {};

		for (const [src, entries] of Object.entries(manga.chapters))
		{
			if (!Array.isArray(entries)) continue;
			for (const entry of entries)
			{
				// Strip any "Chapter " prefix so the key is always just a number string.
				const key = String(entry.name).replace(/^Chapter\s*/i, '').trim();
				if (!slug_map[key]) slug_map[key] = {};
				slug_map[key][src] = entry.chapter_slug || null;
			}
		}

		// If max_chapter is unknown, return only the chapters we actually have slugs for.
		if (!manga.max_chapter) {
			return Object.keys(slug_map)
				.sort((a, b) => parseFloat(b) - parseFloat(a))
				.map(ch => ({ chapter: ch, title: '', chapter_slugs: slug_map[ch] }));
		}

		// Otherwise, generate every integer chapter from max_chapter down to 1.
		// This covers chapters that exist on a source but were not in the slug list.
		const chapters = [];
		for (let i = Math.floor(manga.max_chapter); i >= 1; i--)
		{
			const key = String(i);
			chapters.push({ chapter: key, title: '', chapter_slugs: slug_map[key] ?? {} });
		}

		// Also append any decimal/non-integer chapters (e.g. 12.5, 0) from the slug map.
		for (const key of Object.keys(slug_map)) {
			const n = parseFloat(key);
			if (!Number.isInteger(n)) {
				chapters.push({ chapter: key, title: '', chapter_slugs: slug_map[key] ?? {} });
			}
		}

		// Sort descending so the newest chapter is always at the top.
		chapters.sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));
		return chapters;
	}

	// Build a lightweight manga object from a single index entry.
	// source_urls, chapters, and flame_id are left empty and filled in
	// by fetch_chapters() only when the user actually clicks the manga.
	function _parse_index_entry(entry)
	{
		const source_names = (entry.src || []).map(code => SRC_NAME[code] || code);

		return {
			id:          entry.t,           // title is used as the unique ID
			title:       entry.t,
			cover:       entry.c || null,
			status:      _normalise_status(entry.s),
			max_chapter: entry.m ?? null,
			sources:     source_names,      // array of names, used by Modal to filter sources
			source_urls: {},                // filled in by fetch_chapters()
			chapters:    {},                // filled in by fetch_chapters()
			tags:        [],
			flame_id:    null,              // filled in by fetch_chapters()
			_chunk:      entry.k,           // which chunk file to fetch on click
			_pos:        entry.i,           // position within that chunk
		};
	}

	// Normalise a title for comparison: lowercase, strip accents and punctuation,
	// collapse whitespace. Mirrors the same function in scrape/scrape.js.
	function _normalise(str)
	{
		return str.toLowerCase()
			.normalize('NFKD')
			.replace(/[^\w\s]/g, '')
			.replace(/\s+/g, ' ')
			.trim();
	}

	// Map a raw status string to one of the four canonical values the UI knows about.
	function _normalise_status(s)
	{
		if (!s) return 'unknown';
		const l = s.toLowerCase();
		if (l.includes('ongoing'))   return 'ongoing';
		if (l.includes('completed')) return 'completed';
		if (l.includes('hiatus'))    return 'hiatus';
		return 'unknown';
	}

	return { search_manga, fetch_chapters };

})();
