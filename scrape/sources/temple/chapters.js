/**
 * scrape/sources/temple/chapters.js
 *
 * Fetches the full chapter list for a single Temple Toons series page.
 *
 * ── Why Temple stores ALL chapters (not just non-integer ones) ────────────────
 *
 * Temple Toons does not follow a predictable chapter URL pattern. A chapter
 * at number 12 might have the slug "12-1" or "chapter-12" or something else
 * entirely. We therefore store every chapter slug explicitly so the front-end
 * always has an exact URL to link to.
 *
 * ── Extraction method ────────────────────────────────────────────────────────
 *
 * Individual series pages use the same Next.js embedding as the listing page,
 * but at single-escaped level. We use a targeted regex to extract
 * "chapter_name"/"chapter_slug" pairs from the raw HTML rather than parsing
 * the full JSON blob.
 *
 * The page lists chapters newest-first; we reverse before returning so that
 * index 0 is chapter 1 (makes front-end rendering order natural).
 */

const { http_get } = require('../../lib/helpers');

// Regex for a chapter_name + chapter_slug pair in the single-escaped HTML.
// Matches:  \"chapter_name\":\"Name\"...\"chapter_slug\":\"slug\"
// The .*? between the two fields is non-greedy so it doesn't span entries.
const CHAPTER_PAIR_RE = /\\\"chapter_name\\\":\\\"([^\\\"]+)\\\".*?\\\"chapter_slug\\\":\\\"([^\\\"]+)\\\"/g;

/**
 * Fetch and parse the chapter list for one Temple Toons series.
 *
 * @param {string} series_url  Full URL of the series page, e.g.
 *                             "https://templetoons.com/comic/some-slug"
 * @returns {Promise<Array<{ name: string, chapter_slug: string }>>}
 *          Empty array on any error -- one failing series shouldn't stop the rest.
 */
async function fetch_all_chapters(series_url)
{
	try
	{
		const { status, body } = await http_get(series_url);
		if (status !== 200) return [];

		const chapters = [];
		let m;

		CHAPTER_PAIR_RE.lastIndex = 0;
		while ((m = CHAPTER_PAIR_RE.exec(body)) !== null)
		{
			chapters.push({
				name:         m[1],
				chapter_slug: m[2],
			});
		}

		// Reverse so index 0 = chapter 1 (page lists newest-first).
		chapters.reverse();
		return chapters;
	}
	catch (e)
	{
		console.error(`[Temple] Chapter fetch failed for ${series_url}: ${e.message}`);
		return [];
	}
}

/**
 * Convert a Temple chapter slug into a float chapter number.
 * Used to recompute max_chapter from the actual scraped chapters, which is
 * more accurate than the _count field on the listing page.
 *
 * Examples:
 *   "chapter-12-5"  -> 12.5
 *   "01-chapter-5"  -> 5
 *   "chapter-0"     -> 0
 *
 * Returns null when no number can be parsed.
 */
function parse_chapter_slug_to_number(slug)
{
	if (!slug) return null;
	const clean      = slug.replace(/^\d+-/, '');             // strip numeric prefix
	const stripped   = clean.replace(/^(?:chapter|ch|episode|ep)-/i, '');
	const normalised = stripped.replace(/-(\d+)$/, '.$1');    // trailing "-N" -> ".N"
	const n = parseFloat(normalised);
	return isNaN(n) ? null : n;
}

module.exports = { fetch_all_chapters, parse_chapter_slug_to_number };
