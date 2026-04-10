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
		return `https://www.silentquill.net/${this._to_slug(manga.title)}-chapter-${chapter.chapter}/`;
	}
};