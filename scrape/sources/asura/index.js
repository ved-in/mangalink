const { fetch_series_page, fetch_chapter_list, max_chapter_from_item } = require('./api');
const { sleep, normalise_title, normalise_status, is_non_integer_chapter } = require('../../lib/helpers');
const STOP_STREAK  = 5;
const CONCURRENCY  = 1;
const REQ_DELAY_MS = 500;

async function scrape_asura(opts = {})
{
	const state       = opts.state       ?? null;
	const run         = opts.run         ?? 0;
	const status_only = opts.status_only ?? false;

	console.log('[Asura] Starting...');

	const series    = [];
	let   offset    = 0;
	let   unchanged = 0; // consecutive unchanged item counter

	outer:
	while (true)
	{
		console.log(`[Asura] Fetching offset=${offset}, collected=${series.length}`);

		let items;
		try
		{
			items = await fetch_series_page(offset);
		}
		catch (e)
		{
			console.error(`[Asura] Fetch error at offset ${offset}: ${e.message}`);
			break;
		}
		if (items.length === 0)
		{
			console.log('[Asura] No more items.');
			break;
		}

		for (const item of items)
		{
			if (!item.slug || !item.title) continue;

			const new_count  = item.chapter_count != null ? parseFloat(item.chapter_count) : null;
			const max_ch     = max_chapter_from_item(item);

			if (state)
			{
				const prev = state[normalise_title(item.title)];
				if (prev && prev.chapter_count === new_count)
				{
					series.push({
						title:         item.title,
						slug:          item.slug,
						cover:         item.cover || null,
						status:        normalise_status(item.status),
						sources:       { 'Asura Scans': `https://asurascans.com/comics/${item.slug}` },
						max_chapter:   max_ch,
						chapter_count: new_count,
						chapters:      { 'Asura Scans': null }, // null = keep existing chapters
						_slug:         null, // skip chapter re-fetch
						ua:            item.last_chapter_at || null,
						uf:            prev.uf ?? null, // unchanged -- carry forward
					});
					unchanged++;
					if (!status_only && unchanged >= STOP_STREAK)
					{
						console.log(`[Asura] ${STOP_STREAK} consecutive unchanged -- stopping early.`);
						break outer;
					}
					continue;
				}
				unchanged = 0; // reset streak on any changed series
			}

			const prev_entry = state ? state[normalise_title(item.title)] : null;
			series.push({
				title:         item.title,
				slug:          item.slug,
				cover:         item.cover || null,
				status:        normalise_status(item.status),
				sources:       { 'Asura Scans': `https://asurascans.com/comics/${item.slug}` },
				max_chapter:   max_ch,
				chapter_count: new_count,
				chapters:      { 'Asura Scans': [] },
				_slug:         item.slug, // temporary -- removed after chapter fetch
				ua:            item.last_chapter_at || null,
				uf:            run,
			});
		}

		offset += 20;
	}

	const to_fetch = series.filter(s => s._slug != null);
	console.log(`[Asura] Fetching non-integer chapters for ${to_fetch.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);

		await Promise.all(batch.map(async (s) =>
		{
			const all_chapters      = await fetch_chapter_list(s._slug);
			const non_int_chapters  = all_chapters.filter(ch => is_non_integer_chapter(ch.number));

			if (non_int_chapters.length > 0)
			{
				s.chapters['Asura Scans'] = non_int_chapters.map(ch => ({
					name:         String(ch.number),
					chapter_slug: ch.chapter_slug,
				}));
			}

			delete s._slug; // clean up the temporary field
		}));

		console.log(`[Asura] Chapters: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
		if (i + CONCURRENCY < to_fetch.length) await sleep(REQ_DELAY_MS);
	}
	for (const s of series) delete s._slug;

	console.log(`[Asura] Done. Found ${series.length} series.`);
	return series;
}

module.exports = { scrape_asura };
