/*
 * sources/violet.js -- Violet Scans  (GL/BL manhwa)
 *
 * Series URL format:
 *   https://violetscans.org/comics/{series-slug}/
 *   e.g. https://violetscans.org/comics/our-sunny-days/
 *
 * Chapter URL format:
 *   https://violetscans.org/{series-slug}-chapter-{n}/
 *   e.g. https://violetscans.org/our-sunny-days-chapter-5/
 *
 * SLUG NOTE:
 *   The chapter URL slug matches the series slug exactly, so we always extract
 *   it from the stored series URL rather than re-deriving it from the title.
 *   This matters because some titles have slugs that differ from what slugify()
 *   would produce (e.g. ampersands stripped differently, special abbreviations).
 *
 * PAYWALL NOTE:
 *   Some chapters require a subscription. The modal shows a warning label on
 *   this source's card (handled in modal.js via PAYWALL_SOURCES).
 *
 * CHECK METHOD:
 *   No special check_type -- Violet Scans returns a clean 404 for missing chapters.
 */

const VIOLETSCANS = {
	name: "Violet Scans",
	icon: "💜",
	type: "bl/gl",

	// Extract the series slug from the stored URL, or derive it from the title as fallback.
	_series_slug(manga) {
		return manga.source_urls?.["Violet Scans"]
			? url_last_segment(manga.source_urls["Violet Scans"])
			: slugify(manga.title);
	},

	// Return the series page URL.
	series_url(manga) {
		return manga.source_urls?.["Violet Scans"]
			?? `https://violetscans.org/comics/${this._series_slug(manga)}/`;
	},

	// Return the chapter URL.
	// Priority: (1) stored chapter_slug, (2) constructed from series slug + number.
	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);

		const chapter_slug = chapter.chapter_slugs?.["Violet Scans"];
		if (chapter_slug) return `https://violetscans.org/${chapter_slug}/`;

		return `https://violetscans.org/${this._series_slug(manga)}-chapter-${chapter.chapter}/`;
	},
};
