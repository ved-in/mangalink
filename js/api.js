const API = (() => {

	// SRC_NAME is built at runtime from sources.json (alias → name)
	let SRC_NAME = null;

	let _index  = null;
	let _chunks = {};

	async function _load_index() {
		if (_index) return _index;
		const [index_res, sources_res] = await Promise.all([
			fetch('data/index.json'),
			SRC_NAME ? Promise.resolve(null) : fetch((window.BASE || '') + '/sources.json'),
		]);
		if (!index_res.ok) throw new Error(`Failed to load index.json (HTTP ${index_res.status})`);
		_index = await index_res.json();
		if (sources_res) {
			const data = await sources_res.json();
			SRC_NAME = Object.fromEntries(data.sources.map(s => [s.alias, s.name]));
		}
		return _index;
	}

	async function _load_chunk(k) {
		if (_chunks[k]) return _chunks[k];
		const res = await fetch(`data/chunks/chunk_${k}.json`);
		if (!res.ok) throw new Error(`Failed to load chunk_${k}.json (HTTP ${res.status})`);
		_chunks[k] = await res.json();
		return _chunks[k];
	}

	async function search_manga(query) {
		const index = await _load_index();
		const q = _normalise(query);
		if (!q) return [];
		const q_tokens  = q.split(' ').filter(Boolean);
		const q_is_short = q.length <= 5 && !/\s/.test(q);
		const scored = [];
		for (const entry of index) {
			const norm  = _normalise(entry.t);
			const score = _score(q, q_tokens, q_is_short, norm, entry.m ?? 0);
			if (score > 0) scored.push({ score, entry });
		}
		return scored
			.sort((a, b) =>
				b.score - a.score ||
				a.entry.t.length - b.entry.t.length ||
				a.entry.t.localeCompare(b.entry.t))
			.slice(0, 25)
			.map(({ entry }) => _parse_index_entry(entry));
	}

	function _score(q, q_tokens, q_is_short, norm, max_chapter) {
		if (norm === q)          return 1000 + _pop(max_chapter);
		if (norm.startsWith(q)) return  800 + _pop(max_chapter);
		if (q.startsWith(norm)) return  600 + _pop(max_chapter);
		const n_tokens = norm.split(' ').filter(Boolean);
		if (q_tokens.length > 1) {
			if (_tokens_in_order(q_tokens, n_tokens))  return 500 + _pop(max_chapter);
			if (_all_tokens_hit(q_tokens, n_tokens))   return 400 + _pop(max_chapter);
			const hit = _count_tokens_hit(q_tokens, n_tokens);
			if (hit / q_tokens.length >= 0.75)         return 200 + hit + _pop(max_chapter);
		} else {
			if (n_tokens.includes(q)) return 400 + _pop(max_chapter);
		}
		if (q_is_short && _acronym_match(q, n_tokens)) return 100 + _pop(max_chapter);
		for (const qt of q_tokens) {
			if (qt.length < 4) continue;
			for (const nt of n_tokens) {
				if (Math.abs(qt.length - nt.length) > 1) continue;
				if (_edit_distance(qt, nt) === 1) return 50 + _pop(max_chapter);
			}
		}
		for (const qt of q_tokens) {
			if (qt.length < 3) continue;
			if (norm.includes(qt)) return 1 + _pop(max_chapter);
		}
		return 0;
	}

	function _pop(m) { return Math.min(9, Math.log((m || 0) + 1) / 10); }

	function _tokens_in_order(q_tokens, n_tokens) {
		let ni = 0;
		for (const qt of q_tokens) {
			let found = false;
			while (ni < n_tokens.length) {
				if (n_tokens[ni].startsWith(qt)) { ni++; found = true; break; }
				ni++;
			}
			if (!found) return false;
		}
		return true;
	}

	function _all_tokens_hit(q_tokens, n_tokens) {
		return q_tokens.every(qt => n_tokens.some(nt => nt.startsWith(qt)));
	}

	function _count_tokens_hit(q_tokens, n_tokens) {
		return q_tokens.filter(qt => n_tokens.some(nt => nt.startsWith(qt))).length;
	}

	function _acronym_match(q, n_tokens) {
		if (q.length > n_tokens.length) return false;
		for (let i = 0; i < q.length; i++) if (n_tokens[i]?.[0] !== q[i]) return false;
		return true;
	}

	function _edit_distance(a, b) {
		if (a === b) return 0;
		const la = a.length, lb = b.length;
		let prev = Array.from({ length: lb + 1 }, (_, j) => j), curr = new Array(lb + 1);
		for (let i = 1; i <= la; i++) {
			curr[0] = i;
			for (let j = 1; j <= lb; j++)
				curr[j] = a[i-1] === b[j-1] ? prev[j-1] : 1 + Math.min(prev[j-1], prev[j], curr[j-1]);
			[prev, curr] = [curr, prev];
		}
		return prev[lb];
	}

	async function get_manga(id) {
		const index = await _load_index();
		const entry = index.find(e => e.t === id);
		if (entry) return _parse_index_entry(entry);
		throw new Error('Manga not found in index');
	}

	async function get_recently_updated(limit = 50) {
		const index = await _load_index();
		return index
			.filter(e => e.uf != null || e.ua)
			.sort((a, b) => {
				const uf_diff = (b.uf ?? -1) - (a.uf ?? -1);
				if (uf_diff !== 0) return uf_diff;
				if ((b.ua ?? '') > (a.ua ?? '')) return  1;
				if ((b.ua ?? '') < (a.ua ?? '')) return -1;
				return 0;
			})
			.slice(0, limit)
			.map(e => _parse_index_entry(e));
	}

	async function fetch_chapters(manga) {
		const chunk = await _load_chunk(manga._chunk);
		const full  = chunk[manga._pos];
		manga.source_urls = full.sources         || {};
		manga.chapters    = full.chapters        || {};
		manga.flame_id    = full.flame_series_id ?? null;
		manga.demonic_id  = full.demonic_id      ?? null;
		const slug_map   = {};
		const title_map  = {};
		const locked_map = {};
		for (const [src, entries] of Object.entries(manga.chapters)) {
			if (!Array.isArray(entries)) continue;
			for (const entry of entries) {
				// MangaPlus stores { chapter, name, chapter_slug, is_locked }
				// Other sources store { name: "Chapter N", chapter_slug }
				const has_chapter_field = entry.chapter != null;
				const key = has_chapter_field
					? String(entry.chapter).trim()
					: String(entry.name).replace(/^Chapter\s*/i, '').trim();
				if (!slug_map[key]) slug_map[key] = {};
				slug_map[key][src] = entry.chapter_slug || null;
				// Carry episode title if present (MangaPlus)
				if (entry.name && has_chapter_field && !title_map[key]) {
					title_map[key] = entry.name;
				}
				// Carry locked flag (MangaPlus)
				if (entry.is_locked) locked_map[key] = true;
			}
		}
		if (!manga.max_chapter) {
			return Object.keys(slug_map)
				.sort((a, b) => parseFloat(b) - parseFloat(a))
				.map(ch => ({ chapter: ch, title: title_map[ch] || '', chapter_slugs: slug_map[ch], is_locked: locked_map[ch] ?? false }));
		}
		const chapters = [];
		for (let i = Math.floor(manga.max_chapter); i >= 1; i--) {
			const key = String(i);
			chapters.push({ chapter: key, title: title_map[key] || '', chapter_slugs: slug_map[key] ?? {}, is_locked: locked_map[key] ?? false });
		}
		for (const key of Object.keys(slug_map)) {
			const n = parseFloat(key);
			if (!Number.isInteger(n))
				chapters.push({ chapter: key, title: title_map[key] || '', chapter_slugs: slug_map[key] ?? {}, is_locked: locked_map[key] ?? false });
		}
		chapters.sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));
		return chapters;
	}

	function _parse_index_entry(entry) {
		const source_names = (entry.src || []).map(code => SRC_NAME[code] || code);
		return {
			id:          entry.t,
			title:       entry.t,
			cover:       entry.c || null,
			status:      _normalise_status(entry.s),
			max_chapter: entry.m ?? null,
			updated_at:  entry.ua || null,
			uf:          entry.uf ?? null,
			sources:     source_names,
			source_urls: {},
			chapters:    {},
			tags:        [],
			flame_id:    null,
			_chunk:      entry.k,
			_pos:        entry.i,
		};
	}

	function _normalise(str) {
		return str.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
	}

	function _normalise_status(s) {
		if (!s) return 'unknown';
		const l = s.toLowerCase();
		if (l.includes('dropped') || l.includes('cancelled') || l.includes('canceled')) return 'dropped';
		if (l.includes('hiatus'))    return 'hiatus';
		if (l.includes('ongoing'))   return 'ongoing';
		if (l.includes('completed')) return 'completed';
		return 'unknown';
	}

	return { search_manga, fetch_chapters, get_manga, get_recently_updated };

})();
