const { fetch_build_id, fetch_all_series, fetch_series_detail } = require('./api');
const { sleep, normalise_title, normalise_status, decode_html_entities } = require('../../lib/helpers');
const REQ_DELAY_MS      = 500;
const SKIP_DELAY_MS     = 50;

async function scrape_flame(opts = {})
{
	const state       = opts.state       ?? null;
	const run         = opts.run         ?? 0;
	const status_only = opts.status_only ?? false;

	console.log('[Flame] Starting...');
	let build_id;
	try
	{
		build_id = await fetch_build_id();
		console.log(`[Flame] buildId: ${build_id}`);
	}
	catch (e)
	{
		console.error(`[Flame] Could not get buildId: ${e.message}`);
		return [];
	}
	let series_list;
	try
	{
		series_list = await fetch_all_series();
		console.log(`[Flame] Found ${series_list.length} series`);
	}
	catch (e)
	{
		console.error(`[Flame] Could not fetch series list: ${e.message}`);
		return [];
	}
	const all_series = [];

	for (const item of series_list)
	{
		const { id, label: title, status, chapter_count, image } = item;
		if (!id || !title) continue;

		const new_count  = chapter_count != null ? parseFloat(chapter_count) : null;
		const new_status = normalise_status(status);
		const state_key  = normalise_title(title);
		const prev       = state ? state[state_key] : null;

		const skip_detail = prev != null && prev.chapter_count === new_count;
		console.log(`[Flame] ${skip_detail ? 'Skipping (unchanged)' : 'Processing'}: ${title} (id=${id})`);

		if (skip_detail || status_only)
		{
			const ua = item.last_edit ? new Date(item.last_edit * 1000).toISOString() : null;
			all_series.push({
				title:           decode_html_entities(title),
				slug:            `https://flamecomics.xyz/series/${id}`,
				cover:           null,              // keep existing cover from chunks
				status:          new_status,
				sources:         { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
				flame_series_id: id,
				max_chapter:     new_count,
				chapter_count:   new_count,
				chapters:        { 'Flame Comics': null }, // null = don't overwrite in merge
				ua,
				uf: (new_count != null && new_count > (prev?.max_chapter ?? -1)) ? run : (prev?.uf ?? null),
			});
			await sleep(SKIP_DELAY_MS);
			continue;
		}

		const { cover, chapters, last_edit } = await fetch_series_detail(id, build_id);
		const cover_url = cover
			?? (image ? `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${image}` : null);
		const ua_ts = last_edit ?? item.last_edit ?? null;
		const ua    = ua_ts ? new Date(ua_ts * 1000).toISOString() : null;

		all_series.push({
			title:           decode_html_entities(title),
			slug:            `https://flamecomics.xyz/series/${id}`,
			cover:           cover_url,
			status:          new_status,
			sources:         { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
			flame_series_id: id,
			max_chapter:     new_count,
			chapter_count:   new_count,
			chapters:        { 'Flame Comics': chapters },
			ua,
			uf:  run, // max_chapter increased (or brand new) -- bump uf
		});

		await sleep(REQ_DELAY_MS);
	}

	console.log(`[Flame] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_flame };
