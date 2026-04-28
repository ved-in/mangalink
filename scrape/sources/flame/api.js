const { http_get_with_retry } = require('../../lib/helpers');

async function fetch_build_id()
{
	const { status, body } = await http_get_with_retry('https://flamecomics.xyz');
	if (status !== 200) throw new Error(`Homepage returned HTTP ${status}`);

	const match = body.match(/"buildId"\s*:\s*"([^"]+)"/);
	if (!match) throw new Error('buildId not found in homepage HTML');

	return match[1];
}

async function fetch_all_series()
{
	const { status, body } = await http_get_with_retry('https://flamecomics.xyz/api/series');
	if (status !== 200) throw new Error(`Series list returned HTTP ${status}`);

	return JSON.parse(body);
}

async function fetch_series_detail(series_id, build_id)
{
	const url = `https://flamecomics.xyz/_next/data/${build_id}/series/${series_id}.json?id=${series_id}`;

	try
	{
		const { status, body } = await http_get_with_retry(url);
		if (status !== 200) return { cover: null, chapters: [] };

		const data        = JSON.parse(body);
		const series_info = data?.pageProps?.series;
		const raw_chapters = data?.pageProps?.chapters || [];
		const cover = series_info?.cover
			? `https://cdn.flamecomics.xyz/uploads/images/series/${series_id}/${series_info.cover}`
			: null;
		const chapters = raw_chapters.map(ch => ({
			name:         strip_trailing_zeros(String(ch.chapter)),
			chapter_slug: ch.token,
		}));
		const last_edit = series_info?.last_edit ?? null;

		return { cover, chapters, last_edit };
	}
	catch (e)
	{
		console.error(`[Flame] Detail fetch failed for id=${series_id}: ${e.message}`);
		return { cover: null, chapters: [], last_edit: null };
	}
}

function strip_trailing_zeros(num_str)
{
	const n = parseFloat(num_str);
	return isNaN(n) ? num_str : n.toString();
}

module.exports = { fetch_build_id, fetch_all_series, fetch_series_detail };
