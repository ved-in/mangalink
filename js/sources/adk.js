/*
ADK Scans

series url - https://www.silentquill.net/the-cursed-sword-masters-harem-life-by-the-sword-for-the-sword-cursed-sword-master/
chapter url - https://www.silentquill.net/a-reincarnated-former-slave-forms-the-ultimate-harem-with-the-cheat-skill-myriad-forms-chapter-12/

justttt like asurascans but WITHOUT that hex... phewww
*/

const ADKSCANS = {
	name: "ADK Scans",
	icon: "☄️",
	type: "fantl",

	_to_slug(title)
    {
		return title.toLowerCase()
			.replace(/[^a-z0-9\s-]/g, "")
			.trim()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
	},

	series_url(manga)
    {
		return manga.sources?.["ADK Scans"] || `https://www.silentquill.net/${this._to_slug(manga.title)}/`;
	},

	chapter_url(manga, chapter)
    {
		if (!chapter.chapter) return this.series_url(manga);

		const slug = chapter.chapter_slugs?.["ADK Scans"];
		if (slug) return `https://www.silentquill.net/${slug}/`;

		const series_url = manga.sources?.["ADK Scans"] || '';
		const series_slug = series_url
			? series_url.replace(/\/$/, '').split('/').pop()
			: this._to_slug(manga.title);

		return `https://www.silentquill.net/${series_slug}-chapter-${chapter.chapter}/`;
	}
};