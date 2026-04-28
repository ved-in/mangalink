const { extract_demonic_cards }      = require('./listing');
const { fetch_chapter_data }         = require('./chapters');
const { http_get_with_retry, sleep } = require('../../lib/helpers');
const TERMINAL_STATUSES = new Set(['Completed', 'Dropped']);
const STOP_STREAK = 5;
const CONCURRENCY = 200;
const REQ_DELAY_MS = 500;

async function scrape_demonic(opts = {})
{
	const state       = opts.state       ?? null;
	const run         = opts.run         ?? 0;
	const status_only = opts.status_only ?? false;

	console.log('[Demonic] Starting...');

	const all_series = [];
	const seen_slugs = new Set();
	let   list_num        = 1;
	let   unchanged_pages = 0;

	while (true)
	{
		const url = `https://demonicscans.org/lastupdates.php?list=${list_num}`;
		console.log(`[Demonic] Fetching list=${list_num}, collected=${all_series.length}`);

		let cards = [];
		try
		{
			const { status, body } = await http_get_with_retry(url);
			if (status === 200) cards = extract_demonic_cards(body);
		}
		catch (e)
		{
			console.error(`[Demonic] Fetch error on list=${list_num}: ${e.message}`);
		}

		if (cards.length === 0)
		{
			console.log('[Demonic] Empty page -- end of catalogue.');
			break;
		}
		if (state)
		{
			const page_has_change = cards.some(card =>
			{
				const prev = state[card.slug]; // slug is already lowercased by listing.js
				if (prev && TERMINAL_STATUSES.has(prev.status)) return false;
				return !prev || card.max_chapter > (prev.max_chapter ?? -1);
			});

			if (page_has_change)
			{
				unchanged_pages = 0;
			}
			else
			{
				unchanged_pages++;
				console.log(`[Demonic] Page ${list_num}: all unchanged (${unchanged_pages}/${STOP_STREAK}).`);
				if (unchanged_pages >= STOP_STREAK)
				{
					console.log(`[Demonic] ${STOP_STREAK} consecutive unchanged pages -- stopping early.`);
					break;
				}
			}
		}
		for (const card of cards)
		{
			if (seen_slugs.has(card.slug)) continue;
			const prev = state ? state[card.slug] : null;
			if (prev && TERMINAL_STATUSES.has(prev.status)) continue;

			seen_slugs.add(card.slug);
			if (prev && !(card.max_chapter > (prev.max_chapter ?? -1)))
				card.chapters['Demonic Scans'] = null; // sentinel: keep existing chapters
			all_series.push(card);
		}

		list_num++;
		await sleep(REQ_DELAY_MS);
	}

	const to_fetch = state
		? all_series.filter(s =>
		{
			const prev = state[s.slug.toLowerCase()] ?? state[s.slug];
			return !prev || s.max_chapter > (prev.max_chapter ?? -1);
		})
		: all_series;

	console.log(`[Demonic] Fetching chapters for ${to_fetch.length}/${all_series.length} changed series (concurrency=${CONCURRENCY})...`);

	if (status_only)
	{
		for (const s of all_series)
		{
			s.chapters['Demonic Scans'] = null;
			const prev = state ? (state[s.slug.toLowerCase()] ?? state[s.slug]) : null;
			s.ua = prev?.ua ?? null;
			s.uf = (s.max_chapter != null && s.max_chapter > (prev?.max_chapter ?? -1)) ? run : (prev?.uf ?? null);
		}
		console.log(`[Demonic] Status-only: skipping chapter fetches for ${all_series.length} series.`);
	}
	else
	{

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);

		await Promise.all(batch.map(async (s) =>
		{
			const prev            = state ? (state[s.slug.toLowerCase()] ?? state[s.slug]) : null;
			const chapter_changed = !prev || s.max_chapter > (prev?.max_chapter ?? -1);

			const { chapters, status, ua: site_ua } = await fetch_chapter_data(s._series_url);
			if (chapters.length > 0) s.chapters['Demonic Scans'] = chapters;
			if (status && !s.status) s.status = status;
			s.ua = site_ua || prev?.ua || null;
			s.uf = chapter_changed ? run : (prev?.uf ?? null);
		}));

		console.log(`[Demonic] Chapters: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
		if (i + CONCURRENCY < to_fetch.length) await sleep(REQ_DELAY_MS);
	}
	if (state)
	{
		const to_fetch_set = new Set(to_fetch.map(s => s.slug));
		for (const s of all_series)
		{
			if (!to_fetch_set.has(s.slug) && s.ua === undefined)
			{
				const prev = state[s.slug.toLowerCase()] ?? state[s.slug];
				s.ua = prev?.ua ?? null;
				s.uf = prev?.uf ?? null;
			}
		}
	}
	} // end else (status_only)
	for (const s of all_series) delete s._series_url;

	console.log(`[Demonic] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_demonic };
