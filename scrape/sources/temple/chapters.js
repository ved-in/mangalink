const { http_get_with_retry } = require('../../lib/helpers');
const CHAPTER_PAIR_RE = /\\\"chapter_name\\\":\\\"([^\\\"]+)\\\".*?\\\"chapter_slug\\\":\\\"([^\\\"]+)\\\"/g;
const CHAPTER_FULL_RE = /\\\"index\\\":\\\"(\d+)\\\".*?\\\"chapter_slug\\\":\\\"([^\\\"]+)\\\".*?\\\"created_at\\\":\\\"([^\\\"]+)\\\"/g;

async function fetch_all_chapters(series_url)
{
	try
	{
		const { status, body } = await http_get_with_retry(series_url);
		if (status !== 200) return { chapters: [], ua: null };

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
		chapters.reverse();
		let max_index = -1;
		let ua        = null;

		CHAPTER_FULL_RE.lastIndex = 0;
		while ((m = CHAPTER_FULL_RE.exec(body)) !== null)
		{
			const idx = parseInt(m[1], 10);
			if (idx > max_index)
			{
				max_index = idx;
				const parsed = new Date(m[3]);
				ua = isNaN(parsed) ? null : parsed.toISOString();
			}
		}

		return { chapters, ua };
	}
	catch (e)
	{
		console.error(`[Temple] Chapter fetch failed for ${series_url}: ${e.message}`);
		return { chapters: [], ua: null };
	}
}

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
