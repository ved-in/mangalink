/**
 * scrape/sources/demonic/chapters.js
 *
 * Fetches non-integer chapters for a single Demonic Scans series page.
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
 * ── Extraction ────────────────────────────────────────────────────────────────
 *
 * The series page contains the same <a class="chplinks"> anchors as the listing
 * card, with the same ?manga={id}&chapter={num} href format. We collect all
 * chapter numbers, deduplicate, and filter to non-integers only.
 */

const cheerio = require('cheerio');
const { http_get, is_non_integer_chapter } = require('../../lib/helpers');

/**
 * Fetch and return non-integer chapters for one Demonic series.
 *
 * @param {string} series_url  Full URL of the series page.
 * @returns {Promise<Array<{ name: string, chapter_number: number }>>}
 *          Empty array on any network or parse error.
 */
async function fetch_non_integer_chapters(series_url)
{
	try
	{
		const { status, body } = await http_get(series_url);
		if (status !== 200) return [];

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

		return chapters;
	}
	catch (e)
	{
		console.error(`[Demonic] Chapter fetch failed for ${series_url}: ${e.message}`);
		return [];
	}
}

module.exports = { fetch_non_integer_chapters };
