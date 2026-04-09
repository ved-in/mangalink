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
			if (!manga.max_chapter) return [];

			const chapters = [];
			for (let i = Math.floor(manga.max_chapter); i >= 1; i--)
			{
				chapters.push({ chapter: String(i), title: "" });
			}
			return chapters;
		}

		function _parse_item(s)
		{
			return {
				id: s.title,                    // stable key (no MAL id anymore)
				title: s.title,
				cover: s.cover || null,
				status: _normalise_status(s.status),
				max_chapter: s.max_chapter ?? null,
				sources: s.sources || [],
				tags: [],
				// source-specific fields used by modal sources
				asura_slug:     s.slug && s.sources?.includes("Asura Scans")  ? s.slug : null,
				adk_slug:       s.slug && s.sources?.includes("ADK Scans")    ? s.slug : null,
				thunder_slug:   s.slug && s.sources?.includes("Thunder Scans")? s.slug : null,
				temple_slug:    s.slug && s.sources?.includes("Temple Toons") ? s.slug : null,
				demonic_slug:   s.slug && s.sources?.includes("Demonic Scans")? s.slug : null,
				flame_id:       s.flame_series_id ?? null,
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
