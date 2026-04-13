/*
 * sources/thunder.js -- Thunder Scans
 *
 * Series URL format:
 *   https://en-thunderscans.com/comics/{slug}/
 *   Some series have a numeric prefix on their slug:
 *     https://en-thunderscans.com/comics/0086250808-some-title/
 *
 * Chapter URL format:
 *   https://en-thunderscans.com/{clean-slug}-chapter-{n}/
 *   The chapter URL always uses the slug WITHOUT any leading numeric prefix,
 *   even when the series page URL has one.
 *
 * PAYWALL NOTE:
 *   Some chapters on Thunder Scans require a subscription. The modal shows
 *   a warning label on this source's card (handled in modal.js via PAYWALL_SOURCES).
 *
 * CHECK METHOD:
 *   No special check_type -- Thunder returns a clean 404 for missing chapters,
 *   so a plain HEAD check is sufficient.
 */

const THUNDERSCANS = {
	name: "Thunder Scans",
	icon: "⚡",
	type: "fantl",

	// Return the series page URL.
	series_url(manga) {
		return manga.source_urls?.["Thunder Scans"]
			?? `https://en-thunderscans.com/comics/${slugify(manga.title)}/`;
	},

	// Return the chapter URL.
	// Priority: (1) stored chapter_slug, (2) constructed from the clean series slug + number.
	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);

		// Use the exact slug stored by the scraper for decimal/non-integer chapters.
		const chapter_slug = chapter.chapter_slugs?.["Thunder Scans"];
		if (chapter_slug) return `https://en-thunderscans.com/${chapter_slug}/`;

		// Fallback: strip the numeric prefix from the series slug (if present)
		// because chapter URLs never include that prefix.
		// e.g. "0086250808-some-title" -> "some-title"
		const series_slug = manga.source_urls?.["Thunder Scans"]
			? url_last_segment(manga.source_urls["Thunder Scans"]).replace(/^\d+-/, "")
			: slugify(manga.title);

		return `https://en-thunderscans.com/${series_slug}-chapter-${chapter.chapter}/`;
	},
};
