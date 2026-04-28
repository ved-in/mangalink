const DEMONICSCANS = {
	name: "Demonic Scans",
	icon: "😈",
	type: "fantl",
	check_type: "html_alt",

	_encode_slug(title) {
		return title
			.trim()
			.replace(/-/g,  "%25252D")
			.replace(/:/g,  "%253A")
			.replace(/!/g,  "%2521")
			.replace(/\[/g, "%255B")
			.replace(/\]/g, "%255D")
			.replace(/\(/g, "%2528")
			.replace(/\)/g, "%2529")
			.replace(/\//g, "%252F")
			.replace(/\s+/g, "-")
			.replace(/[^a-zA-Z0-9\-%]/g, "");
	},

	get_alt_text(manga, chapter) {
		return `${manga.title} Chapter ${chapter.chapter} 1`;
	},

	series_url(manga) {
		return manga.source_urls?.["Demonic Scans"]
			?? `https://demonicscans.org/manga/${this._encode_slug(manga.title)}`;
	},

	chapter_url(manga, chapter) {
		if (chapter.chapter == null) return this.series_url(manga);

		if (manga.demonic_id) {
			return `https://demonicscans.org/chaptered.php?manga=${manga.demonic_id}&chapter=${chapter.chapter}`;
		}

		return `https://demonicscans.org/title/${this._encode_slug(manga.title)}/chapter/${chapter.chapter}/1`;
	},
};
