/*
 * sources/temple.js -- Temple Toons  (primarily GL manhwa)
 *
 * Series URL format:
 *   https://templetoons.com/comic/{series-slug}
 *   e.g. https://templetoons.com/comic/our-temperature
 *
 * Chapter URL format:
 *   https://templetoons.com/comic/{series-slug}/{chapter-slug}
 *   e.g. https://templetoons.com/comic/our-temperature/chapter-12
 *
 * Chapter slugs are stored from the scraper (chapter.chapter_slugs["Temple Toons"])
 * and used directly. If a slug is missing, we fall back to "chapter-{n}".
 *
 * CHECK METHOD:
 *   check_type: "html_alt"
 *   Temple Toons returns HTTP 403 when chapter pages are fetched by bots,
 *   so a direct HEAD check on the chapter URL always fails. Instead, we fetch
 *   the SERIES page (which is publicly accessible) and look for an img tag
 *   with alt="Chapter {n}" -- these are the chapter thumbnail images that
 *   appear in the chapter list on the series page.
 *
 *   get_check_url() returns the series page URL.
 *   get_alt_text()  returns the expected alt attribute value for the chapter.
 */

const TEMPLESCANS = {
	name: "Temple Toons",
	icon: "🏛️",
	type: "gl",
	check_type: "html_alt",

	// Return the series page URL.
	series_url(manga) {
		return manga.source_urls?.["Temple Toons"]
			?? `https://templetoons.com/comic/${slugify(manga.title)}`;
	},

	// The page the Checker should fetch for the html_alt check.
	// We use the series page because chapter pages return 403 to bots.
	get_check_url(manga) {
		return this.series_url(manga);
	},

	// The img alt attribute value that signals the chapter exists on the series page.
	// Temple Toons renders chapter thumbnails as: <img alt="Chapter 21" ...>
	get_alt_text(_manga, chapter) {
		return `Chapter ${chapter.chapter}`;
	},

	// Return the chapter URL.
	// Uses the scraped chapter slug when available, otherwise constructs "chapter-{n}".
	chapter_url(manga, chapter) {
		const slug = chapter.chapter_slugs?.["Temple Toons"] ?? `chapter-${chapter.chapter}`;
		return `${this.series_url(manga)}/${slug}`;
	},
};
