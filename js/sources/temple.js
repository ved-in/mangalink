/*
Temple Toons
https://templetoons.com

Mainly GL manhwa.

series url - https://templetoons.com/comic/{slug}
	e.g. https://templetoons.com/comic/gl-murmur

chapter url - https://templetoons.com/comic/{slug}/chapter-{n}
	e.g. https://templetoons.com/comic/gl-murmur/chapter-21

Chapter existence is checked by fetching the SERIES page and looking
for alt="Chapter {n}" in the chapter list thumbnails, since chapter
pages themselves block bot requests with 403.
*/

const TEMPLESCANS = {
	name: "Temple Toons",
	icon: "🏛️",
	type: "gl",
	check_type: "html_alt",

	_to_slug(title)
	{
		return title
			.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
	},

	// Checked on the SERIES page, not the chapter page (chapter pages 403)
	get_check_url(manga, _chapter)
	{
		return `https://templetoons.com/comic/${this._to_slug(manga.title)}`;
	},

	// The series page has thumbnails like: <img alt="Chapter 21" ...>
	get_alt_text(_manga, chapter)
	{
		return `Chapter ${chapter.chapter}`;
	},

	series_url(manga)
	{
		return `https://templetoons.com/comic/${this._to_slug(manga.title)}`;
	},

	chapter_url(manga, chapter)
	{
		if (!chapter.chapter) return this.series_url(manga);
		return `https://templetoons.com/comic/${this._to_slug(manga.title)}/chapter-${chapter.chapter}`;
	}
};