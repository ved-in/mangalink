/*
Thunder Scans
https://en-thunderscans.com

series url - https://en-thunderscans.com/comics/{slug}/ or sometimes https://en-thunderscans.com/comics/{num}-{slug}/
	e.g. https://en-thunderscans.com/comics/a-wimps-strategy-guide-to-conquer-the-tower/
	     https://en-thunderscans.com/comics/0086250808-i-got-the-weakest-class-dragon-tamer/

chapter url - https://en-thunderscans.com/{slug}-chapter-{n}/
	e.g. https://en-thunderscans.com/a-wimps-strategy-guide-to-conquer-the-tower-chapter-22/
	     https://en-thunderscans.com/i-got-the-weakest-class-dragon-tamer-chapter-223/

Chapter URLs use the clean slug (no numeric prefix) so noz
Returns a proper 404 when the chapter doesn't exist, so no special check needed.
*/

const THUNDERSCANS = {
	name: "Thunder Scans",
	icon: "⚡",
	type: "fantl",

	_to_slug(title)
	{
		return title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
	},

	series_url(manga)
	{
		return manga.sources?.["Thunder Scans"] || `https://en-thunderscans.com/comics/${this._to_slug(manga.title)}/`;
	},

	chapter_url(manga, chapter)
	{
		if (!chapter.chapter) return this.series_url(manga);

		const slug = chapter.chapter_slugs?.["Thunder Scans"];
		if (slug) return `https://en-thunderscans.com/${slug}/`;

		const series_url = manga.sources?.["Thunder Scans"] || '';
		const series_slug = series_url
			? series_url.replace(/\/$/, '').split('/').pop().replace(/^\d+-/, '')
			: this._to_slug(manga.title);

		return `https://en-thunderscans.com/${series_slug}-chapter-${chapter.chapter}/`;
	},
};