/*
 * sources/flame.js -- Flame Comics
 *
 * Series URL format:
 *   https://flamecomics.xyz/series/{flame_series_id}
 *   e.g. https://flamecomics.xyz/series/127
 *
 * Chapter URL format:
 *   https://flamecomics.xyz/series/{flame_series_id}/{hex_token}
 *   e.g. https://flamecomics.xyz/series/127/a3f8c2d1
 *
 * THE HEX TOKEN PROBLEM:
 *   Each chapter URL includes an unpredictable hex token that cannot be
 *   guessed from the chapter number. The scraper stores these tokens in
 *   chapter.chapter_slugs["Flame Comics"] for each chapter it finds.
 *   If a token is missing (chapter was published after the last scrape),
 *   we fall back to the series page so the user can find it manually.
 *
 * CHECK METHOD:
 *   check_type: "always_found"
 *   Because we cannot construct a verifiable chapter URL without the token,
 *   we skip the network check entirely and show a "browse" badge instead.
 *   The user is expected to locate the chapter on the series page themselves.
 */

const FLAMESCANS = {
	name: "Flame Comics",
	icon: "🔥",
	type: "fantl",

	// Used when chapter hex not found. chapter may or may not exist
	get_check_type(manga, chapter)
	{
		const has_token = !!(chapter.chapter_slugs?.["Flame Comics"] && manga.flame_id);
		return has_token ? undefined : "always_found";
	},


	// Return the series page URL.
	// Prefers the stored URL, falls back to constructing from flame_id,
	// returns null if neither is available (series not in our dataset).
	series_url(manga) {
		if (manga.source_urls?.["Flame Comics"]) return manga.source_urls["Flame Comics"];
		if (manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}`;
		return null;
	},

	// Return the chapter URL when we have the scraped hex token,
	// or fall back to the series page if the token is missing.
	chapter_url(manga, chapter) {
		const slug = chapter.chapter_slugs?.["Flame Comics"];
		if (slug && manga.flame_id) return `https://flamecomics.xyz/series/${manga.flame_id}/${slug}`;
		return this.series_url(manga);
	},
};
