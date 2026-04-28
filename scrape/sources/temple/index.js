const { extract_with_fallback }                   = require('./patterns');
const { fetch_all_chapters, parse_chapter_slug_to_number } = require('./chapters');
const { http_get_with_retry, sleep, decode_html_entities,
        normalise_title, normalise_status }        = require('../../lib/helpers');
const CONCURRENCY  = 1;
const REQ_DELAY_MS = 500;

async function scrape_temple_toons(opts = {})
{
	const state       = opts.state       ?? null;
	const run         = opts.run         ?? 0;
	const status_only = opts.status_only ?? false;

	console.log('[Temple] Starting...');

	let html;
	try
	{
		const { status, body } = await http_get_with_retry('https://templetoons.com/comics');
		if (status !== 200)
		{
			console.error(`[Temple] Listing page returned HTTP ${status}`);
			return [];
		}
		html = body;
	}
	catch (e)
	{
		console.error(`[Temple] Failed to fetch listing page: ${e.message}`);
		return [];
	}

	const { matches, escape_level } = extract_with_fallback(html);
	const { slugs, titles, thumbs, ccounts, statuses } = matches;

	console.log(`[Temple] escape_level=${escape_level}, slugs=${slugs.length}, titles=${titles.length}, thumbs=${thumbs.length}`);
	if (slugs.length === 0 || slugs.length !== titles.length || slugs.length !== thumbs.length)
	{
		console.error(`[Temple] Field count mismatch (slugs=${slugs.length}, titles=${titles.length}, thumbs=${thumbs.length}) -- aborting to prevent data corruption.`);
		return [];
	}

	const all_series = [];
	const seen_slugs = new Set();
	for (let i = 1; i < slugs.length; i++)
	{
		const series_slug = slugs[i];
		const title       = titles[i];
		const cover       = thumbs[i];
		const raw_status  = statuses[i] || null;
		const new_count   = ccounts[i] ?? null; // null if this series has no _count field

		if (!series_slug || seen_slugs.has(series_slug)) continue;
		if (!title || title.length <= 1) continue; // single-char titles are parse artifacts
		seen_slugs.add(series_slug);

		const series_url  = `https://templetoons.com/comic/${series_slug}`;
		const state_entry = state ? state[normalise_title(title)] : null;
		const chapter_count_unchanged = new_count !== null && state_entry?.chapter_count === new_count;
		const max_chapter_unchanged   = new_count === null && state_entry?.max_chapter != null;
		const skip_detail = !!(state_entry && (chapter_count_unchanged || max_chapter_unchanged));

		all_series.push({
			title:         decode_html_entities(title),
			slug:          series_url,
			cover,
			status:        normalise_status(raw_status),
			sources:       { 'Temple Toons': series_url },
			chapters:      { 'Temple Toons': [] },
			max_chapter:   new_count,
			chapter_count: new_count,
			_series_url:   series_url, // removed after chapter fetch
			_skip_detail:  skip_detail,
		});
	}

	const to_fetch_count = all_series.filter(s => !s._skip_detail).length;
	console.log(`[Temple] Fetching chapters for ${to_fetch_count}/${all_series.length} series...`);

	for (let i = 0; i < all_series.length; i += CONCURRENCY)
	{
		const batch = all_series.slice(i, i + CONCURRENCY);

		await Promise.all(batch.map(async (s) =>
		{
			const state_entry = state ? state[normalise_title(s.title)] : null;

			if (s._skip_detail || status_only)
			{
				s.chapters['Temple Toons'] = null;
				s.ua = state_entry?.ua ?? null;
				const chapter_changed = !state_entry || s.chapter_count !== state_entry.chapter_count;
				s.uf = chapter_changed ? run : (state_entry?.uf ?? null);
				return;
			}

			const { chapters, ua: site_ua } = await fetch_all_chapters(s._series_url);

			if (chapters.length > 0)
			{
				s.chapters['Temple Toons'] = chapters;
				let max = null;
				for (const ch of chapters)
				{
					const n = parse_chapter_slug_to_number(ch.chapter_slug);
					if (n !== null && (max === null || n > max)) max = n;
				}
				if (max !== null) s.max_chapter = max;
			}
			s.ua = site_ua || state_entry?.ua || null;
			const chapter_changed = !state_entry || s.chapter_count !== state_entry.chapter_count;
			s.uf = chapter_changed ? run : (state_entry?.uf ?? null);
		}));

		console.log(`[Temple] Chapters: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
		if (has_fetch && i + CONCURRENCY < all_series.length) await sleep(REQ_DELAY_MS);
	}
	for (const s of all_series)
	{
		delete s._series_url;
		delete s._skip_detail;
	}

	console.log(`[Temple] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_temple_toons };
