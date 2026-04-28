const ADKSCANS = {
	name: "ADK Scans",
	icon: "☄️",
	type: "fantl",

	series_url(manga) {
		return manga.source_urls?.["ADK Scans"]
			?? `https://www.silentquill.net/${slugify(manga.title)}/`;
	},

	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);

		const chapter_slug = chapter.chapter_slugs?.["ADK Scans"];
		if (chapter_slug) return `https://www.silentquill.net/${chapter_slug}/`;

		const series_slug = manga.source_urls?.["ADK Scans"]
			? url_last_segment(manga.source_urls["ADK Scans"])
			: slugify(manga.title);

		return `https://www.silentquill.net/${series_slug}-chapter-${chapter.chapter}/`;
	},
};
