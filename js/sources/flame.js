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
    check_type: "always_found",   // skip the proxy check entirely

    series_url(manga)
    {
        if (manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}`;
        // fallback: slug-based guess (less reliable)
        return `https://flamecomics.xyz/series/${this._to_slug(manga.title)}`;
    },

    // We always link to the series page regardless of chapter
    chapter_url(manga, _chapter)
    {
        return this.series_url(manga);
    },

    _to_slug(title)
    {
        return title.toLowerCase()
            .replace(/[^a-z0-9\s-]/g, "")
            .trim()
            .replace(/\s+/g, "-")
            .replace(/-+/g, "-");
    },
};
