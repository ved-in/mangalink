/**
 * scrape/sources/demonic/chapters.js
 *
 * Fetches non-integer chapters AND status for a single Demonic Scans series page.
 *
 * ── Why only non-integer chapters? ───────────────────────────────────────────
 *
 * Demonic chapter URLs follow a predictable pattern:
 *   https://demonicscans.org/chaptered.php?manga={demonic_id}&chapter={num}
 *
 * The front-end can reconstruct any integer chapter URL from just demonic_id
 * and the chapter number. We only need to explicitly store non-integer chapters
 * (12.5, 0/prologue) because their URLs cannot be guessed from the number alone.
 *
 * ── Status extraction ─────────────────────────────────────────────────────────
 *
 * The listing pages don't expose status, but the series page does:
 *   <li style="...">Status</li>
 *   <li>Ongoing</li>
 *
 * We extract it here during the chapter fetch so we don't need an extra request.
 */

const cheerio = require('cheerio');
const { http_get_with_retry, is_non_integer_chapter, normalise_status } = require('../../lib/helpers');

/**
 * Fetch non-integer chapters and status for one Demonic series.
 *
 * @param {string} series_url  Full URL of the series page.
 * @returns {Promise<{ chapters: Array, status: string|null }>}
 *          chapters is empty array on error; status is null if not found.
 */
async function fetch_chapter_data(series_url)
{
	try
	{
		const { status: http_status, body } = await http_get_with_retry(series_url);
		if (http_status !== 200) return { chapters: [], status: null };

		const $        = cheerio.load(body);
		const seen     = new Set();
		const chapters = [];

		$('a.chplinks').each((_, a) =>
		{
			const href     = $(a).attr('href') || '';
			const ch_match = href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
			if (!ch_match) return;

			const num = parseFloat(ch_match[1]);
			if (seen.has(num) || !is_non_integer_chapter(num)) return;

			seen.add(num);
			chapters.push({
				name:           String(num),
				chapter_number: num,
			});
		});

		// Extract status: find the <li> that says "Status" then read the next sibling.
		let series_status = null;
		$('li').each((_, li) =>
		{
			if ($(li).text().trim() === 'Status')
			{
				const next_text = $(li).next('li').text().trim();
				if (next_text) series_status = normalise_status(next_text);
				return false; // stop iterating
			}
		});

		return { chapters, status: series_status };
	}
	catch (e)
	{
		console.error(`[Demonic] Chapter fetch failed for ${series_url}: ${e.message}`);
		return { chapters: [], status: null };
	}
}

module.exports = { fetch_chapter_data };
