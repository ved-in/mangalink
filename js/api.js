/*
Data fetching via Jikan (MyAnimeList's unofficial API)
Rate-limited to like 3 req/sec which is okayyy not bad. Since

I tried mangadex and jikan both (had a lot of issues with mangadex but it worked)
butt both of em do not have many mangas/manhwas chapter list properly populated
I did find MANY apis on github which manually scrape from anime-planet. 

Making that api will be a LONG term goal currently its functional...
*/

const API = (
	() => {

		const BASE = "https://api.jikan.moe/v4";

		async function jikan_fetch(path)
		{
			const res = await fetch(BASE + path);
			if (!res.ok) throw new Error(`Jikan HTTP ${res.status}`);
			const json = await res.json();
			if (json.status && !json.data) throw new Error(`Jikan: ${json.message || json.status}`);
			return json;
		}

		async function search_manga(query)
		{
			const j = await jikan_fetch(`/manga?q=${encodeURIComponent(query)}&limit=10&sfw=false`);
			if (!Array.isArray(j.data)) throw new Error("Unexpected Jikan response");
			return j.data.map(parse_item);
		}

		async function fetch_chapters(manga)
		{
			let count = manga.chapters;
			if (!count) return [];

			const chapters = [];
			for (let i = count; i >= 1; i--)
			{
				chapters.push({ chapter: String(i), title: ""});
			}
			return chapters;
		}

		function parse_item(item)
		{
			return {
				id: String(item.mal_id),
				mal_id: item.mal_id,
				title: item.title_english || item.title || "Unknown",
				cover: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || null,
				status: normalise_status(item.status),
				year: item.published?.prop?.from?.year || null,
				chapters: item.chapters || 0,
				tags: (item.genres || []).map(g => g.name).slice(0, 3),
			};
		}

		function normalise_status(s)
		{
			if (!s) return "unknown";
			const l = s.toLowerCase();
			if (l.includes("publishing")) return "ongoing";
			if (l.includes("finished")) return "completed";
			if (l.includes("hiatus")) return "hiatus";
			return "unknown";
		}

		return { search_manga, fetch_chapters };

	}
)();
