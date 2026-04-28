const MANGAPLUS = {
	name:   "MangaPlus",
	icon:   "📖",
	type:   "official",

	get_check_type(manga, chapter) {
		return "always_found";
	},

	series_url(manga) {
		return manga.source_urls?.["MangaPlus"] ?? null;
	},

	chapter_url(manga, chapter) {
		const slug = chapter?.chapter_slugs?.["MangaPlus"]
			?? chapter?.chapter_slug;
		if (slug) return `https://mangaplus.shueisha.co.jp/viewer/${slug}`;
		return this.series_url(manga);
	},

	is_chapter_locked(chapter) {
		return !!chapter?.is_locked;
	},
};
