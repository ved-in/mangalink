/*
 * sources/demonic.js -- Demonic Scans
 *
 * Series URL format:
 *   https://demonicscans.org/manga/{encoded-slug}
 *
 * Chapter URL formats (two variants):
 *   With numeric manga ID (preferred):
 *     https://demonicscans.org/chaptered.php?manga={id}&chapter={n}
 *   Without ID (fallback):
 *     https://demonicscans.org/title/{encoded-slug}/chapter/{n}/1
 *
 * SLUG ENCODING:
 *   Demonic uses a non-standard double-percent-encoding for special characters
 *   in their URLs (e.g. "-" becomes "%25252D"). The _encode_slug() method
 *   replicates this exactly to produce valid URLs.
 *
 * CHECK METHOD:
 *   check_type: "html_alt"
 *   Demonic chapter pages serve a lot of images. Rather than checking a
 *   HEAD request (unreliable), we fetch the chapter page HTML and look for
 *   an img tag whose alt attribute matches "{title} Chapter {n} 1".
 *   The "1" refers to page 1, which every chapter has.
 */

const DEMONICSCANS = {
	name: "Demonic Scans",
	icon: "😈",
	type: "fantl",
	check_type: "html_alt",

	// Encode a title into Demonic's non-standard URL format.
	// Special characters are double-percent-encoded to match what their site generates.
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

	// Return the expected alt text on page 1's image -- used for the html_alt check.
	// Demonic sets alt="{Title} Chapter {n} 1" on the first image of every chapter.
	get_alt_text(manga, chapter) {
		return `${manga.title} Chapter ${chapter.chapter} 1`;
	},

	// Return the series page URL.
	series_url(manga) {
		return manga.source_urls?.["Demonic Scans"]
			?? `https://demonicscans.org/manga/${this._encode_slug(manga.title)}`;
	},

	// Return the chapter URL.
	// Uses the cleaner query-string format when we have the numeric manga ID,
	// otherwise falls back to the title-encoded path format.
	chapter_url(manga, chapter) {
		if (chapter.chapter == null) return this.series_url(manga);

		if (manga.demonic_id) {
			// Preferred: short, stable URL using the numeric ID stored by the scraper.
			return `https://demonicscans.org/chaptered.php?manga=${manga.demonic_id}&chapter=${chapter.chapter}`;
		}

		// Fallback: construct from the encoded slug.
		return `https://demonicscans.org/title/${this._encode_slug(manga.title)}/chapter/${chapter.chapter}/1`;
	},
};
