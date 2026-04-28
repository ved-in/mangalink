const cheerio = require('cheerio');
const { http_get_with_retry, is_non_integer_chapter, normalise_status } = require('../../lib/helpers');

async function fetch_chapter_data(series_url)
{
	try
	{
		const { status: http_status, body } = await http_get_with_retry(series_url);
		if (http_status !== 200) return { chapters: [], status: null, ua: null };

		const $        = cheerio.load(body);
		const seen     = new Set();
		const chapters = [];
		let   ua       = null;
		let   max_num  = -Infinity;

		$('a.chplinks').each((_, a) =>
		{
			const href     = $(a).attr('href') || '';
			const ch_match = href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
			if (!ch_match) return;

			const num = parseFloat(ch_match[1]);
			const date_str = $(a).find('span[style*="float:right"]').text().trim();
			if (date_str && num > max_num)
			{
				max_num = num;
				const parsed = new Date(date_str + 'T00:00:00.000Z');
				if (!isNaN(parsed)) ua = parsed.toISOString();
			}

			if (seen.has(num) || !is_non_integer_chapter(num)) return;

			seen.add(num);
			chapters.push({
				name:           String(num),
				chapter_number: num,
			});
		});
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

		return { chapters, status: series_status, ua };
	}
	catch (e)
	{
		console.error(`[Demonic] Chapter fetch failed for ${series_url}: ${e.message}`);
		return { chapters: [], status: null, ua: null };
	}
}

module.exports = { fetch_chapter_data };
