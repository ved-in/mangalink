/*
Violet Scans
https://violetscans.org

series url  - https://violetscans.org/comics/{slug}/
  e.g.      - https://violetscans.org/comics/i-became-the-male-leads-adopted-daughter/

chapter url - https://violetscans.org/{slug}-chapter-{n}/
  e.g.      - https://violetscans.org/i-became-the-male-leads-adopted-daughter-chapter-158/

Slug in chapter URLs matches the series URL slug exactly, so we extract
it from manga.sources["Violet Scans"] directly instead of re-deriving
from the title (avoids any title-normalisation mismatches).

Returns a proper 404 when the chapter doesn't exist, so no special check needed.
*/

const VIOLETSCANS = {
	name: "Violet Scans",
	icon: "💜",
	type: "gl",

	_series_slug(manga)
	{
		const series_url = manga.sources?.["Violet Scans"];
		if (series_url)
		{
			const slug = series_url.replace(/\/$/, "").split("/").pop();
			if (slug) return slug;
		}
		return manga.title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
	},

	series_url(manga)
	{
		return manga.sources?.["Violet Scans"] || `https://violetscans.org/comics/${this._series_slug(manga)}/`;
	},

	chapter_url(manga, chapter)
	{
		if (!chapter.chapter) return this.series_url(manga);

		const slug = chapter.chapter_slugs?.["Violet Scans"];
		if (slug) return `https://violetscans.org/${slug}/`;

		return `https://violetscans.org/${this._series_slug(manga)}-chapter-${chapter.chapter}/`;
	},
};
