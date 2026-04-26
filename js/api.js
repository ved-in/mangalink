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
 *
 * SEARCH ALGORITHM - score tiers (higher = better):
 *   1000  Exact match  800  Title prefix  600  Query prefix
 *    500  All tokens in order  400  All tokens any order
 *    200  ≥75% tokens hit  100  Acronym  50  Fuzzy (edit dist 1)  1  Substring
 *   Popularity bonus: +log(max_chapter+1)/10, never overrides tier.
 *   Within tier: score desc → title length asc → alphabetical.
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
	// Returns up to 25 results sorted by composite score (see file header).
	async function search_manga(query)
	{
		const index = await _load_index();
		const q = _normalise(query);
		if (!q) return [];

		const q_tokens = q.split(' ').filter(Boolean);
		const q_is_short = q.length <= 5 && !/\s/.test(q); // acronym candidate

		const scored = [];
		for (const entry of index)
		{
			const norm  = _normalise(entry.t);
			const score = _score(q, q_tokens, q_is_short, norm, entry.m ?? 0);
			if (score > 0) scored.push({ score, entry });
		}

		return scored
			.sort((a, b) =>
				b.score - a.score ||
				a.entry.t.length - b.entry.t.length ||
				a.entry.t.localeCompare(b.entry.t)
			)
			.slice(0, 25)
			.map(({ entry }) => _parse_index_entry(entry));
	}

	function _score(q, q_tokens, q_is_short, norm, max_chapter)
	{
		// Tier 1: Exact
		if (norm === q) return 1000 + _pop(max_chapter);

		// Tier 2: Prefix
		if (norm.startsWith(q)) return 800 + _pop(max_chapter);
		if (q.startsWith(norm)) return 600 + _pop(max_chapter);

		const n_tokens = norm.split(' ').filter(Boolean);

		if (q_tokens.length > 1)
		{
			// Tier 3: All tokens in order
			if (_tokens_in_order(q_tokens, n_tokens))
				return 500 + _pop(max_chapter);

			// Tier 4: All tokens, any order
			if (_all_tokens_hit(q_tokens, n_tokens))
				return 400 + _pop(max_chapter);

			// Tier 5: ≥75% tokens hit
			const hit_count = _count_tokens_hit(q_tokens, n_tokens);
			if (hit_count / q_tokens.length >= 0.75)
				return 200 + hit_count + _pop(max_chapter);
		}
		else
		{
			// Single-word query: token match avoids false positives from substring-inside-word.
			if (n_tokens.includes(q)) return 400 + _pop(max_chapter);
		}

		// Tier 6: Acronym - e.g. "sl" matches "Solo Leveling"
		if (q_is_short && _acronym_match(q, n_tokens))
			return 100 + _pop(max_chapter);

		// Tier 7: Fuzzy - edit distance 1, tokens ≥4 chars only
		for (const qt of q_tokens)
		{
			if (qt.length < 4) continue;
			for (const nt of n_tokens)
			{
				if (Math.abs(qt.length - nt.length) > 1) continue;
				if (_edit_distance(qt, nt) === 1)
					return 50 + _pop(max_chapter);
			}
		}

		// Tier 8: Substring catch-all (backwards compat)
		for (const qt of q_tokens)
		{
			if (qt.length < 3) continue;  // skip noise like "a", "of"
			if (norm.includes(qt)) return 1 + _pop(max_chapter);
		}

		return 0;
	}

	// Popularity bonus: ln(max_chapter+1)/10, capped at 9. Nudges established
	// series upward within a tier without ever overriding tier ordering.
	function _pop(max_chapter)
	{
		return Math.min(9, Math.log((max_chapter || 0) + 1) / 10);
	}

	// True when every query token appears left-to-right as a subsequence of title tokens.
	function _tokens_in_order(q_tokens, n_tokens)
	{
		let ni = 0;
		for (const qt of q_tokens)
		{
			let found = false;
			while (ni < n_tokens.length)
			{
				if (n_tokens[ni].startsWith(qt)) { ni++; found = true; break; }
				ni++;
			}
			if (!found) return false;
		}
		return true;
	}

	// True when every query token prefix-matches at least one title token (any order).
	function _all_tokens_hit(q_tokens, n_tokens)
	{
		return q_tokens.every(qt => n_tokens.some(nt => nt.startsWith(qt)));
	}

	// Count of query tokens that prefix-match at least one title token.
	function _count_tokens_hit(q_tokens, n_tokens)
	{
		return q_tokens.filter(qt => n_tokens.some(nt => nt.startsWith(qt))).length;
	}

	// True when each char of q matches the first char of successive title tokens.
	function _acronym_match(q, n_tokens)
	{
		if (q.length > n_tokens.length) return false;
		for (let i = 0; i < q.length; i++)
		{
			if (n_tokens[i]?.[0] !== q[i]) return false;
		}
		return true;
	}

	// Levenshtein distance; only called when |a|-|b| ≤ 1.
	function _edit_distance(a, b)
	{
		if (a === b) return 0;
		const la = a.length, lb = b.length;
		let prev = Array.from({ length: lb + 1 }, (_, j) => j);
		let curr = new Array(lb + 1);
		for (let i = 1; i <= la; i++)
		{
			curr[0] = i;
			for (let j = 1; j <= lb; j++)
			{
				curr[j] = a[i - 1] === b[j - 1]
					? prev[j - 1]
					: 1 + Math.min(prev[j - 1], prev[j], curr[j - 1]);
			}
			[prev, curr] = [curr, prev];
		}
		return prev[lb];
	}

	async function get_manga(id) {
		const index = await _load_index();
		const entry = index.find(e => e.t === id);
		if (entry) return _parse_index_entry(entry);
		throw new Error("Manga not found in index");
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

	// Map a raw status string to one of the five canonical values the UI knows about.
	function _normalise_status(s)
	{
		if (!s) return 'unknown';
		const l = s.toLowerCase();
		if (l.includes('dropped')   || l.includes('cancelled') || l.includes('canceled')) return 'dropped';
		if (l.includes('hiatus'))    return 'hiatus';
		if (l.includes('ongoing'))   return 'ongoing';
		if (l.includes('completed')) return 'completed';
		return 'unknown';
	}

	return { search_manga, fetch_chapters, get_manga };

})();
