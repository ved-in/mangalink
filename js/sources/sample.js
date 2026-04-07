// DO NOT ADD AGGREGATORS >:(

const SampleSource = {
	name: "Site Name",
	icon: "🌐",
	type: "fantl", // genre/type label, just for reference

	_to_slug(title)
	// THIS WILL BE CHANGED ACCORDING TO SITES. Some of em are... weird...
	{
		return title
			.toLowerCase()
			.replace(/['":.,()?!]/g, "")  // strip special chars - adjust per site
			.replace(/\s+/g, "-")         // spaces -> hyphens
			.replace(/-+/g, "-")          // collapse multiple hyphens
			.trim();
	},

	series_url(manga)
	{
		return `https://example.com/manga/${this._to_slug(manga.title)}`;
	},

	chapter_url(manga, chapter)
	{
		if (!chapter.chapter) return this.series_url(manga);
		return `https://example.com/manga/${this._to_slug(manga.title)}/chapter/${chapter.chapter}`;
	},

	// Only needed if the URL to CHECK is different from chapter_url
	// e.g. demonic scans....
	// If omitted, modal.js falls back to checking chapter_url itself
	// Refer to js/sources/demonic.js for this

	get_test_urls(manga, chapter)
	{
		if (!chapter.chapter) return [];
		const slug = this._to_slug(manga.title);
		// Return multiple URLs if the extension or path style is unpredictable
		return [
			`https://cdn.example.com/${slug}/${chapter.chapter}/1.jpg`,
			`https://cdn.example.com/${slug}/${chapter.chapter}/1.webp`,
			`https://cdn.example.com/${slug}/${chapter.chapter}/1.png`,
		];
	},
};