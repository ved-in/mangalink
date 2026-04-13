/*
 * sources/adk.js -- ADK Scans  (hosted at silentquill.net)
 *
 * Series URL format:
 *   https://www.silentquill.net/{series-slug}/
 *   e.g. https://www.silentquill.net/the-cursed-sword-masters-harem-life/
 *
 * Chapter URL format:
 *   https://www.silentquill.net/{series-slug}-chapter-{n}/
 *   e.g. https://www.silentquill.net/the-cursed-sword-masters-harem-life-chapter-12/
 *
 * For decimal chapters (e.g. 11.5), the stored chapter_slug from the scraper
 * is used because the URL pattern for non-integers varies.
 *
 * CHECK METHOD:
 *   Silentquill returns a clean 404 for missing chapters, so no special check type needed.
 */

const ADKSCANS = {
	name: "ADK Scans",
	icon: "☄️",
	type: "fantl",

	// Return the series page URL.
	series_url(manga) {
		return manga.source_urls?.["ADK Scans"]
			?? `https://www.silentquill.net/${slugify(manga.title)}/`;
	},

	// Return the chapter URL.
	// Priority: (1) stored chapter_slug from the scraper, (2) constructed from series slug + number.
	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);

		// Use the exact slug stored by the scraper if we have it.
		const chapter_slug = chapter.chapter_slugs?.["ADK Scans"];
		if (chapter_slug) return `https://www.silentquill.net/${chapter_slug}/`;

		// Fallback: extract the series slug from the stored series URL,
		// or derive it from the title if no URL is stored.
		const series_slug = manga.source_urls?.["ADK Scans"]
			? url_last_segment(manga.source_urls["ADK Scans"])
			: slugify(manga.title);

		return `https://www.silentquill.net/${series_slug}-chapter-${chapter.chapter}/`;
	},
};
