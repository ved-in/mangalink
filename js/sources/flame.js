/*
Flame Comics
https://flamecomics.xyz

Chapter URLs use a hex segment that has no discernible pattern,
so we cannot construct chapter links directly.
Instead we always send the user to the series main page.

series url - https://flamecomics.xyz/series/{flame_series_id}
  e.g.     - https://flamecomics.xyz/series/2

No chapter existence check is performed — the link always shows as
"available" so the user can browse chapters themselves on the site.
*/

const FLAMESCANS = {
    name: "Flame Comics",
    icon: "🔥",
    type: "fantl",

    series_url(manga)
    {
        if (manga.sources?.["Flame Comics"]) return manga.sources["Flame Comics"];
        if (manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}`;
        return null;
    },

	chapter_url(manga, chapter)
	{
		const slug = chapter.chapter_slugs?.["Flame Comics"];
		if (slug && manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}/${slug}`;
		return this.series_url(manga);
	},
};