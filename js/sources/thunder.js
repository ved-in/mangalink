const THUNDERSCANS = {
	name: "Thunder Scans",
	icon: "⚡",
	type: "fantl",

	series_url(manga) {
		return manga.source_urls?.["Thunder Scans"]
			?? `https://en-thunderscans.com/comics/${slugify(manga.title)}/`;
	},

	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);

		const chapter_slug = chapter.chapter_slugs?.["Thunder Scans"];
		if (chapter_slug) return `https://en-thunderscans.com/${chapter_slug}/`;

		const series_slug = manga.source_urls?.["Thunder Scans"]
			? url_last_segment(manga.source_urls["Thunder Scans"]).replace(/^\d+-/, "")
			: slugify(manga.title);

		return `https://en-thunderscans.com/${series_slug}-chapter-${chapter.chapter}/`;
	},
};
