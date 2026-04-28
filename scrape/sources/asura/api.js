const { http_get_with_retry } = require('../../lib/helpers');

const API_BASE = 'https://api.asurascans.com/api';

async function fetch_series_page(offset)
{
	const url = `${API_BASE}/series?sort=latest&order=desc&limit=20&offset=${offset}`;

	const { status, body } = await http_get_with_retry(url);
	if (status !== 200) throw new Error(`HTTP ${status}`);

	const json = JSON.parse(body);
	return json.data || [];
}

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
