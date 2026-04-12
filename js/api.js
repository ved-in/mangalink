/*
Data is now served from our own series.json (built by the scraper)
instead of the Jikan/MAL API.

Search: fuzzy-matches against title in the local dataset.
Chapters: generated from max_chapter stored per series.
          If max_chapter is null the chapter list is empty — UI will
          show the manual chapter-number input instead.
*/

const API = (
	() => {

		let _series = null;

		async function _load_series()
		{
			if (_series) return _series;
			const res = await fetch("data/series.json");
			if (!res.ok) throw new Error(`Failed to load series.json (HTTP ${res.status})`);
			_series = await res.json();
			return _series;
		}

		async function search_manga(query)
		{
			const series = await _load_series();
			const q = _normalise(query);
			if (!q) return [];

			const scored = [];
			for (const s of series)
			{
				const norm = _normalise(s.title);
				let score = 0;
				if (norm === q) score = 3;   				// exact
				else if (norm.startsWith(q)) score = 2;   	// prefix
				else if (norm.includes(q)) score = 1;   	// substring
				if (score > 0) scored.push({ score, s });
			}

			return scored
				.sort((a, b) => b.score - a.score || a.s.title.localeCompare(b.s.title))
				.slice(0, 10)
				.map(({ s }) => _parse_item(s));
		}

		async function fetch_chapters(manga)
		{
			// Prefer the scraped chapter list for any source that has one,
			// since it carries chapter_slug (needed for correct URLs on e.g. Temple Toons).
			const source_chapters = manga.chapters || {};

			const slug_map = {};

			for (const [src, entries] of Object.entries(source_chapters))
			{
				if (!Array.isArray(entries)) continue;
				for (const entry of entries)
				{
					const key = String(entry.name).replace(/^Chapter\s*/i, "").trim();
					if (!slug_map[key]) slug_map[key] = {};
					slug_map[key][src] = entry.chapter_slug || null;
				}
			}

			if (!manga.max_chapter) {
				return Object.keys(slug_map)
					.sort((a, b) => parseFloat(b) - parseFloat(a))
					.map(ch => ({ chapter: ch, title: "", chapter_slugs: slug_map[ch] }));
			}

			const chapters = [];
			for (let i = Math.floor(manga.max_chapter); i >= 1; i--)
			{
				const key = String(i);
				chapters.push({ chapter: key, title: "", chapter_slugs: slug_map[key] ?? {} });
			}

			for (const key of Object.keys(slug_map)){
				const n = parseFloat(key);
				if (!Number.isInteger(n)) {
					chapters.push({ chapter: key, title: "", chapter_slugs: slug_map[key] ?? {} });
				}
			}

			chapters.sort((a, b) => parseFloat(b.chapter) - parseFloat(a.chapter));
			return chapters;
		}

		function _parse_item(s)
		{
			// series.json: s.sources is a dict { "Source Name": "https://..." }
			const source_urls  = s.sources || {};
			const source_names = Object.keys(source_urls);

			return {
				id: s.title,
				title: s.title,
				cover: s.cover || null,
				status: _normalise_status(s.status),
				max_chapter: s.max_chapter ?? null,
				sources: source_names,               // array of names — used by modal, debug, console.log
				source_urls,                         // dict name→url — used by each source module
				chapters: s.chapters || {},          // per-source chapter lists (with chapter_slug)
				tags: [],
				flame_id: s.flame_series_id ?? null,
			};
		}

		function _normalise(str)
		{
			return str.toLowerCase()
				.normalize("NFKD")
				.replace(/[^\w\s]/g, "")
				.replace(/\s+/g, " ")
				.trim();
		}

		function _normalise_status(s)
		{
			if (!s) return "unknown";
			const l = s.toLowerCase();
			if (l.includes("ongoing"))   return "ongoing";
			if (l.includes("completed")) return "completed";
			if (l.includes("hiatus"))    return "hiatus";
			return "unknown";
		}

		return { search_manga, fetch_chapters };

	}
)();
