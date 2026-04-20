/*
 * sources/asura.js -- Asura Scans
 *
 * Series URL format:
 *   https://asurascans.com/comics/{slug}-{8-char-hex-hash}
 *   e.g. https://asurascans.com/comics/solo-leveling-75e30c62
 *
 * Chapter URL format:
 *   {series_url}/chapter/{chapter_slug_or_number}
 *   e.g. https://asurascans.com/comics/solo-leveling-75e30c62/chapter/200
 *
 * THE HASH PROBLEM:
 *   Each series URL ends with an unpredictable 8-character hex hash (e.g. -75e30c62).
 *   We store the correct URL in manga.source_urls["Asura Scans"] from the scraper,
 *   so it is always accurate for known series. For series without a stored URL, we
 *   fall back to a hardcoded hash (_HASH) that covers the vast majority of series.
 *   The hash occasionally rotates; update _HASH if links start breaking.
 *
 * CHECK METHOD:
 *   Asura returns a clean 404 for missing chapters, so a plain HEAD check works fine.
 *   No special check_type is needed.
 */

const ASURASCANS = {
	name: "Asura Scans",
	icon: "⚔️",
	type: "fantl",

	// Fallback hash appended to slugified titles when no stored URL is available.
	// Update this if Asura rotates their hash and guessed URLs start 404-ing.
	_HASH: "-75e30c62",

	// Return the series page URL.
	// Prefers the stored URL from the scraper; falls back to slugify + hash.
	series_url(manga) {
		return manga.source_urls?.["Asura Scans"]
			?? `https://asurascans.com/comics/${slugify(manga.title)}${this._HASH}`;
	},

	// Return the direct chapter URL.
	// Rebuilds the base URL from the stored series URL, stripping the old hash
	// and reattaching the current one, then appends the chapter slug or number.
	chapter_url(manga, chapter) {
		const stored = manga.source_urls?.["Asura Scans"];
		const base = stored
			// Remove trailing slash and old hash, then reattach current hash.
			// This handles the case where Asura rotates the hash between scrape runs.
			? stored.replace(/\/$/, "").replace(/-[0-9a-f]{8}$/, "") + this._HASH
			: `https://asurascans.com/comics/${slugify(manga.title)}${this._HASH}`;

		// Use the scraped chapter slug when available (more reliable than the number).
		const slug = chapter.chapter_slugs?.["Asura Scans"] ?? chapter.chapter;
		return `${base}/chapter/${slug}`;
	},
};
