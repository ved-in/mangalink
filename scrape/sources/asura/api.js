/**
 * scrape/sources/asura/api.js
 *
 * Low-level API calls for Asura Scans.
 *
 * Asura exposes a proper JSON REST API:
 *
 *   Series list (paginated):
 *     GET https://api.asurascans.com/api/series
 *         ?sort=latest&order=desc&limit=20&offset={n}
 *
 *     Each item includes: slug, title, cover, status, chapter_count,
 *     and latest_chapters (array of the most recent chapters with numbers).
 *
 *   Series chapter list:
 *     GET https://api.asurascans.com/api/series/{slug}/chapters
 *
 *     Returns all chapters for one series with their slugs. We only call this
 *     for series that have non-integer chapters, since integer chapter URLs
 *     can be reconstructed on the front-end.
 */

const { http_get_with_retry } = require('../../lib/helpers');

const API_BASE = 'https://api.asurascans.com/api';

/**
 * Fetch one page of the series list from the Asura API.
 *
 * @param {number} offset  Pagination offset (multiples of 20).
 * @returns {Promise<Array>}  Raw API items, or [] on any error.
 */
async function fetch_series_page(offset)
{
	const url = `${API_BASE}/series?sort=latest&order=desc&limit=20&offset=${offset}`;

	const { status, body } = await http_get_with_retry(url);
	if (status !== 200) throw new Error(`HTTP ${status}`);

	const json = JSON.parse(body);
	return json.data || [];
}

/**
 * Fetch the full chapter list for one series.
 * Used only for series that have non-integer chapter numbers.
 *
 * @param {string} slug  The series slug from the list API.
 * @returns {Promise<Array<{ name: string, chapter_slug: string, number: number }>>}
 *          Empty array on any error so one bad series doesn't abort the whole scrape.
 */
async function fetch_chapter_list(slug)
{
	try
	{
		const { status, body } = await http_get_with_retry(`${API_BASE}/series/${slug}/chapters`);
		if (status !== 200) return [];

		const json = JSON.parse(body);
		return (json.data || []).map(ch => ({
			name:         ch.title || `Chapter ${ch.number}`,
			chapter_slug: ch.slug,
			number:       ch.number,
		}));
	}
	catch (e)
	{
		console.error(`[Asura] Chapter fetch failed for slug "${slug}": ${e.message}`);
		return [];
	}
}

/**
 * Extract the highest chapter number from an API series item.
 *
 * Priority: latest_chapters array > chapter_count field.
 * latest_chapters is more accurate because chapter_count can lag behind
 * when a new chapter is published but the count hasn't updated yet.
 *
 * @param {object} item  Raw item from the series list API.
 * @returns {number|null}
 */
function max_chapter_from_item(item)
{
	let max = null;

	if (Array.isArray(item.latest_chapters))
	{
		for (const ch of item.latest_chapters)
		{
			const n = parseFloat(ch.number ?? ch.chapter ?? '');
			if (!isNaN(n) && (max === null || n > max)) max = n;
		}
	}

	if (max === null && item.chapter_count != null)
	{
		const n = parseFloat(item.chapter_count);
		if (!isNaN(n)) max = n;
	}

	return max;
}

module.exports = { fetch_series_page, fetch_chapter_list, max_chapter_from_item };
