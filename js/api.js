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

			const source_with_list = Object.keys(source_chapters)
				.find(src => Array.isArray(source_chapters[src]) && source_chapters[src].length > 0);

			if (source_with_list)
			{
				// { name: "Chapter 8", chapter_slug: "19220-chapter-8" }
				// → { chapter: "8", title: "", chapter_slug: "19220-chapter-8" }
				return source_chapters[source_with_list]
					.map(entry => ({
						chapter: String(entry.name).replace(/^Chapter\s*/i, "").trim(),
						title: "",
						chapter_slug: entry.chapter_slug || null,
					}))
					.reverse(); // show highest chapter first
			}

			// No scraped list — fall back to numeric stubs.
			if (!manga.max_chapter) return [];

			const chapters = [];
			for (let i = Math.floor(manga.max_chapter); i >= 1; i--)
			{
				chapters.push({ chapter: String(i), title: "", chapter_slug: null });
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
				chapters: s.chapters || {},     // per-source chapter lists (with chapter_slug)
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
