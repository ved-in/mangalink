/**
 * scrape/sources/flame/api.js
 *
 * Low-level API calls for Flame Comics.
 *
 * Flame Comics is a Next.js site with two useful endpoints:
 *
 *   1. Series list (one request, returns everything):
 *        GET https://flamecomics.xyz/api/series
 *        JSON array of { id, label, status, chapter_count, image }
 *
 *   2. Series detail (one request per series):
 *        GET https://flamecomics.xyz/_next/data/{buildId}/series/{id}.json?id={id}
 *        Full series info including exact cover filename and all chapters with tokens.
 *
 * ── The buildId ───────────────────────────────────────────────────────────────
 *
 * Next.js embeds a deployment-specific buildId in every page's __NEXT_DATA__
 * JSON blob. The data endpoint URL changes with each deployment, so we must
 * extract the current buildId from the homepage HTML before fetching any
 * per-series data. (This approach is borrowed from the Tachiyomi/Mihon extension.)
 *
 * ── Chapter tokens ────────────────────────────────────────────────────────────
 *
 * Unlike every other source, Flame chapter URLs contain an unpredictable hex
 * token (e.g. "a3f8c2d1"). We store every token for every chapter because
 * the front-end cannot reconstruct chapter URLs from the number alone.
 */

const { http_get } = require('../../lib/helpers');

/**
 * Extract the current Next.js buildId from the Flame Comics homepage.
 * The buildId is embedded in the __NEXT_DATA__ JSON: {"buildId":"abc123",...}
 *
 * @returns {Promise<string>}  The buildId string.
 * @throws  {Error}            If the homepage can't be fetched or buildId isn't found.
 */
async function fetch_build_id()
{
	const { status, body } = await http_get('https://flamecomics.xyz');
	if (status !== 200) throw new Error(`Homepage returned HTTP ${status}`);

	const match = body.match(/"buildId"\s*:\s*"([^"]+)"/);
	if (!match) throw new Error('buildId not found in homepage HTML');

	return match[1];
}

/**
 * Fetch the complete series list from the Flame public API.
 * Returns all series in one request -- no pagination needed.
 *
 * @returns {Promise<Array>}  Raw API items (id, label, status, chapter_count, image).
 * @throws  {Error}           On network or parse failure.
 */
async function fetch_all_series()
{
	const { status, body } = await http_get('https://flamecomics.xyz/api/series');
	if (status !== 200) throw new Error(`Series list returned HTTP ${status}`);

	return JSON.parse(body);
}

/**
 * Fetch the cover URL and full chapter list for one Flame series.
 *
 * @param {string|number} series_id  The numeric series ID from the list API.
 * @param {string}        build_id   Current Next.js buildId from fetch_build_id().
 * @returns {Promise<{ cover: string|null, chapters: Array }>}
 *           chapters is an array of { name, chapter_slug } where chapter_slug is the hex token.
 *           Returns { cover: null, chapters: [] } on any error.
 */
async function fetch_series_detail(series_id, build_id)
{
	const url = `https://flamecomics.xyz/_next/data/${build_id}/series/${series_id}.json?id=${series_id}`;

	try
	{
		const { status, body } = await http_get(url);
		if (status !== 200) return { cover: null, chapters: [] };

		const data        = JSON.parse(body);
		const series_info = data?.pageProps?.series;
		const raw_chapters = data?.pageProps?.chapters || [];

		// Build the absolute cover URL using Flame's CDN domain.
		const cover = series_info?.cover
			? `https://cdn.flamecomics.xyz/uploads/images/series/${series_id}/${series_info.cover}`
			: null;

		// Store every chapter with its hex token.
		// strip_trailing_zeros converts "12.50" -> "12.5" for display.
		const chapters = raw_chapters.map(ch => ({
			name:         strip_trailing_zeros(String(ch.chapter)),
			chapter_slug: ch.token,
		}));

		return { cover, chapters };
	}
	catch (e)
	{
		console.error(`[Flame] Detail fetch failed for id=${series_id}: ${e.message}`);
		return { cover: null, chapters: [] };
	}
}

/**
 * Remove unnecessary trailing zeros from a chapter number string.
 * "12.50" -> "12.5",  "5.0" -> "5",  "12" -> "12"
 */
function strip_trailing_zeros(num_str)
{
	const n = parseFloat(num_str);
	return isNaN(n) ? num_str : n.toString();
}

module.exports = { fetch_build_id, fetch_all_series, fetch_series_detail };
