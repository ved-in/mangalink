const FLAMESCANS = {
	name: "Flame Comics",
	icon: "🔥",
	type: "fantl",

	get_check_type(manga, chapter)
	{
		const has_token = !!(chapter.chapter_slugs?.["Flame Comics"] && manga.flame_id);
		return has_token ? undefined : "always_found";
	},

	series_url(manga) {
		if (manga.source_urls?.["Flame Comics"]) return manga.source_urls["Flame Comics"];
		if (manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}`;
		return null;
	},

	chapter_url(manga, chapter) {
		const slug = chapter.chapter_slugs?.["Flame Comics"];
		if (slug && manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}/${slug}`;
		return this.series_url(manga);
	},
};
