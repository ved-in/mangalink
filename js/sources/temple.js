const TEMPLESCANS = {
	name: "Temple Toons",
	icon: "🏛️",
	type: "fantl",
	check_type: "html_alt",

	series_url(manga) {
		return manga.source_urls?.["Temple Toons"]
			?? `https://templetoons.com/comic/${slugify(manga.title)}`;
	},

	get_check_url(manga) {
		return this.series_url(manga);
	},

	get_alt_text(_manga, chapter) {
		return `Chapter ${chapter.chapter}`;
	},

	chapter_url(manga, chapter) {
		const slug = chapter.chapter_slugs?.["Temple Toons"] ?? `chapter-${chapter.chapter}`;
		return `${this.series_url(manga)}/${slug}`;
	},
};
