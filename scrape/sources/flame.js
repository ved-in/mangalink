/*
 * scrape/sources/flame.js -- Flame Comics scraper
 *
 * Flame Comics uses Next.js and exposes two useful endpoints:
 *
 *   1. GET https://flamecomics.xyz/api/series
 *      Returns a JSON array of all series with id, label, status, chapter_count, image.
 *
 *   2. GET https://flamecomics.xyz/_next/data/{buildId}/series/{id}.json?id={id}
 *      Returns full series info including cover URL and the chapter list with tokens.
 *
 * THE BUILD ID:
 *   Next.js embeds a buildId in its __NEXT_DATA__ JSON on every page. The data
 *   endpoint URL changes with each deployment. We extract the current buildId from
 *   the homepage HTML before fetching any series data.
 *   (Credit to the Tachiyomi/Mihon extension source for this approach.)
 *
 * CHAPTER TOKENS:
 *   Unlike other sources, Flame chapter URLs contain an unpredictable hex token
 *   (e.g. "a3f8c2d1") that cannot be guessed from the chapter number. We store
 *   every token in chapters["Flame Comics"] so the front-end can build exact URLs.
 *
 * INCREMENTAL MODE:
 *   The /api/series endpoint returns chapter_count for every series in one request.
 *   In quick mode we skip the per-series Next.js data fetch for any series whose
 *   chapter_count matches the stored state -- saving potentially hundreds of requests.
 *   Status is always updated from the list endpoint (free, no extra requests).
 *
 * RATE LIMITING:
 *   We sleep 500ms between series requests (2 req/s) to match the rate limit
 *   used by the Mihon extension.
 */

const { fetch, sleep, decode_html_entities, normalise_status } = require('./helpers');

// Normalise a title to the same key used in scrape_state.json.
// Mirrors normalise() in scrape.js exactly so state lookups hit correctly.
function _norm(title)
{
	return title.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// Strip unnecessary trailing zeros from a float string.
// e.g. "12.50" -> "12.5", "5.0" -> "5"
function strip_trailing_zeros(num_str)
{
	const n = parseFloat(num_str);
	if (isNaN(n)) return num_str;
	return n.toString();
}

// opts.state   -- scrape_state map (series id as string -> { chapter_count }) or null
// opts.is_quick -- true when running in quick mode
async function scrape_flame(opts = {})
{
	const state    = opts.state    || null;
	const is_quick = opts.is_quick || false;

	console.log(`[Flame] Starting (mode=${is_quick ? 'quick' : 'deep'})...`);

	// Step 1: extract the current Next.js buildId from the homepage.
	// The buildId is embedded in a JSON blob: {"buildId":"abc123",...}
	const home_res       = await fetch('https://flamecomics.xyz');
	const build_id_match = home_res.body.match(/"buildId"\s*:\s*"([^"]+)"/);
	if (!build_id_match)
	{
		console.error('[Flame] Could not extract buildId');
		return [];
	}
	const buildId = build_id_match[1];
	console.log(`[Flame] buildId: ${buildId}`);

	// Step 2: fetch the full series list from the public API.
	const series_res  = await fetch('https://flamecomics.xyz/api/series');
	const series_list = JSON.parse(series_res.body);
	console.log(`[Flame] Found ${series_list.length} series`);

	const all_series = [];

	for (const item of series_list)
	{
		const id    = item.id;
		const title = item.label;
		if (!id || !title) continue;

		const new_count  = item.chapter_count ? parseFloat(item.chapter_count) : null;
		const new_status = normalise_status(item.status);

		// Quick mode: skip per-series fetch when chapter_count is unchanged.
		// We still push an entry so status updates propagate even without new chapters.
		const state_key = _norm(title);
		const prev      = state ? state[state_key] : null;
		const skip_detail = is_quick && prev && prev.chapter_count === new_count;

		console.log(`[Flame] ${skip_detail ? 'Skipping (unchanged)' : 'Processing'}: ${title} (id=${id})`);

		if (skip_detail)
		{
			// Emit a minimal entry so merge_status can update if needed.
			// chapter_count field lets scrape.js update state correctly.
			all_series.push({
				title:          decode_html_entities(title),
				slug:           `https://flamecomics.xyz/series/${id}`,
				cover:          null,          // not fetched -- keep existing cover in merge
				status:         new_status,
				sources:        { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
				flame_series_id: id,
				max_chapter:    new_count,
				chapter_count:  new_count,
				chapters:       { 'Flame Comics': null }, // null sentinel = don't overwrite
			});
			await sleep(50);
			continue;
		}

		// Step 3: fetch chapter list and series metadata from the Next.js data endpoint.
		const ch_url   = `https://flamecomics.xyz/_next/data/${buildId}/series/${id}.json?id=${id}`;
		let chapters   = [];
		let cover_url  = null;

		try
		{
			const ch_res = await fetch(ch_url);
			if (ch_res.status === 200)
			{
				const ch_data     = JSON.parse(ch_res.body);
				const series_info = ch_data?.pageProps?.series;

				// Build the absolute cover URL using the CDN domain.
				if (series_info?.cover)
				{
					cover_url = `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${series_info.cover}`;
				}

				// Store every chapter with its hex token so the front-end can build exact URLs.
				chapters = (ch_data?.pageProps?.chapters || []).map(ch => ({
					name:         strip_trailing_zeros(String(ch.chapter)),
					chapter_slug: ch.token,
				}));
			}
		}
		catch (e)
		{
			console.error(`[Flame] error: ${e.message}`);
			return [];
		}

		// Use the item.image field as a fallback cover if the series page had none.
		if (!cover_url && item.image)
		{
			cover_url = `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${item.image}`;
		}

		all_series.push({
			title:          decode_html_entities(title),
			slug:           `https://flamecomics.xyz/series/${id}`,
			cover:          cover_url,
			status:         new_status,
			sources:        { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
			flame_series_id: id,
			max_chapter:    new_count,
			chapter_count:  new_count,
			chapters:       { 'Flame Comics': chapters },
		});

		// Rate limit: 500ms between requests to stay at ~2 req/s.
		await sleep(500);
	}

	console.log(`[Flame] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_flame };
