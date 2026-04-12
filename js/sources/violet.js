const VIOLETSCANS = {
	name: "Violet Scans",
	icon: "💜",
	type: "bl/gl",

	_series_slug(manga) {
		return manga.source_urls?.["Violet Scans"]
			? url_last_segment(manga.source_urls["Violet Scans"])
			: slugify(manga.title);
	},

	series_url(manga) {
		return manga.source_urls?.["Violet Scans"]
			?? `https://violetscans.org/comics/${this._series_slug(manga)}/`;
	},

	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);

		const chapter_slug = chapter.chapter_slugs?.["Violet Scans"];
		if (chapter_slug) return `https://violetscans.org/${chapter_slug}/`;

		return `https://violetscans.org/${this._series_slug(manga)}-chapter-${chapter.chapter}/`;
	},
};
