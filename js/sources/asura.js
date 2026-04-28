var ASURASCANS = {
	name: "Asura Scans",
	icon: "⚔️",
	type: "fantl",

	_HASH: "-75e30c62",

	series_url(manga) {
		return manga.source_urls?.["Asura Scans"]
			?? `https://asurascans.com/comics/${slugify(manga.title)}${this._HASH}`;
	},

	chapter_url(manga, chapter) {
		const stored = manga.source_urls?.["Asura Scans"];
		const base = stored
			? stored.replace(/\/$/, "").replace(/-[0-9a-f]{8}$/, "") + this._HASH
			: `https://asurascans.com/comics/${slugify(manga.title)}${this._HASH}`;

		const slug = chapter.chapter_slugs?.["Asura Scans"] ?? chapter.chapter;
		return `${base}/chapter/${slug}`;
	},
};
