/*
THE GOATTT
but the hash... currently 75e30c62 keeps keeps keeps changing...
No idea why but if I can find some pattern, I'll be happy af

series url - https://asurascans.com/comics/solo-leveling-ragnarok-75e30c62
chapter url - https://asurascans.com/comics/solo-leveling-ragnarok-75e30c62/chapter/67

In this... if the chapter does not exist I get a CLEAR 404 status code...
*/

const AsuraSource = {
	name: "Asura Scans",
	icon: "⚔️",
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
		return `https://asurascans.com/comics/${this._to_slug(manga.title)}-75e30c62`;
	},

	chapter_url(manga, chapter)
	{
		if (!chapter.chapter) return this.series_url(manga);
		return `https://asurascans.com/comics/${this._to_slug(manga.title)}-75e30c62/chapter/${chapter.chapter}`;
	}
};
