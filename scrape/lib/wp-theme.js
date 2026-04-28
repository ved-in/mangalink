const cheerio = require('cheerio');
const { http_get_with_retry, sleep, decode_html_entities, add_cards,
        is_non_integer_chapter, parse_chapter_label } = require('./helpers');

function extract_status_from_card($el, $)
{
	const status_text = $el.find('div.status i').first().text().trim();
	if (status_text)
	{
		const l = status_text.toLowerCase();
		if (l === 'ongoing')   return 'Ongoing';
		if (l === 'completed') return 'Completed';
		if (l === 'hiatus')    return 'Hiatus';
		if (l === 'dropped')   return 'Dropped';
	}
	const own_cls = $el.attr('class') || '';
	if (own_cls.includes('status-ongoing'))   return 'Ongoing';
	if (own_cls.includes('status-completed')) return 'Completed';
	if (own_cls.includes('status-hiatus'))    return 'Hiatus';
	if (own_cls.includes('status-dropped'))   return 'Dropped';

	let found = null;
	$el.find('[class*="status-"]').each((_, el) =>
	{
		if (found) return;
		const c = $(el).attr('class') || '';
		if (c.includes('status-ongoing'))   found = 'Ongoing';
		if (c.includes('status-completed')) found = 'Completed';
		if (c.includes('status-hiatus'))    found = 'Hiatus';
		if (c.includes('status-dropped'))   found = 'Dropped';
	});
	return found;
}

function extract_wp_cards(html, source_name, base_url, seen_slugs, slug_from_href)
{
	const $ = cheerio.load(html);
	const epxs_re   = /class="epxs">([^<]+)<\/div>/g;
	const epxs_vals = [];
	let em;
	while ((em = epxs_re.exec(html)) !== null) epxs_vals.push(em[1].trim());

	const cards    = [];
	let   card_idx = 0;

	$('.listupd .bs .bsx').each((_, el) =>
	{
		const $el  = $(el);
		const link = $el.find('a').first();
		const href = link.attr('href');
		if (!href) return;
		const raw_slug = (slug_from_href
			? slug_from_href(href)
			: (href.match(/\/comics\/([^\/]+)\/?/)?.[1] ?? null)
		)?.toLowerCase();

		if (!raw_slug || seen_slugs.has(raw_slug)) { card_idx++; return; }
		const series_url = href.endsWith('/') ? href : href + '/';
		const title =
			link.attr('title') ||
			$el.find('.tt').text().trim() ||
			raw_slug.replace(/-/g, ' ');
		const cover =
			$el.find('.limit img').attr('src') ||
			$el.find('img').first().attr('src') ||
			null;
		const max_chapter = parse_chapter_label(epxs_vals[card_idx] || '');

		const status = extract_status_from_card($el, $);

		cards.push({
			title:       decode_html_entities(title),
			slug:        raw_slug,
			cover,
			status,
			sources:     { [source_name]: series_url },
			max_chapter,
			chapters:    { [source_name]: [] },
			_series_url: series_url,  // removed after chapter fetch
		});

		card_idx++;
	});

	return cards;
}

async function fetch_non_integer_chapters(series_url, source_name)
{
	try
	{
		const { status, body } = await http_get_with_retry(series_url);
		if (status !== 200) return { chapters: [], ua: null };

		const $        = cheerio.load(body);
		const chapters = [];

		$('#chapterlist ul li').each((_, li) =>
		{
			const num  = $(li).attr('data-num');
			const href = $(li).find('a[href]').first().attr('href');
			if (!num || !href) return;

			if (!is_non_integer_chapter(parseFloat(num))) return;
			const ch_slug = href.replace(/\/$/, '').split('/').pop();
			chapters.push({
				name:         String(parseFloat(num)),
				chapter_slug: ch_slug,
			});
		});
		const ua_raw = $('meta[property="og:updated_time"]').attr('content') || null;
		const ua     = ua_raw ? new Date(ua_raw).toISOString() : null;

		return { chapters, ua };
	}
	catch (e)
	{
		console.error(`[${source_name}] Chapter fetch failed for ${series_url}: ${e.message}`);
		return { chapters: [], ua: null };
	}
}

async function scrape_wp_site(config)
{
	const {
		name,
		listing_url,
		listing_url_suffix = '',
		slug_from_href  = null,
		state           = null,
		run             = 0,
		req_delay_ms    = 500,
		status_override = null,
		status_only     = false,
	} = config;
	const UNCHANGED_PAGE_STREAK = 3;
	const EMPTY_PAGE_STREAK     = 5;

	const all_series       = [];
	const seen_slugs       = new Set();
	let   page             = 1;
	let   unchanged_pages  = 0; // pages where every card's max_chapter is already in state
	let   empty_pages      = 0; // pages that returned zero cards (end-of-catalogue signal)
	let   stop             = false;

	console.log(`[${name}] Starting...`);

	while (!stop && empty_pages < EMPTY_PAGE_STREAK)
	{
		const url = `${listing_url}${page}${listing_url_suffix}`;
		console.log(`[${name}] Fetching page ${page}, collected=${all_series.length}`);

		let body;
		try
		{
			const res = await http_get_with_retry(url);
			if (res.status !== 200)
			{
				console.error(`[${name}] HTTP ${res.status} on page ${page} -- stopping.`);
				break;
			}
			body = res.body;
		}
		catch (e)
		{
			console.error(`[${name}] Fetch error on page ${page}: ${e.message} -- stopping.`);
			break;
		}

		const cards = extract_wp_cards(body, name, listing_url, new Set(), slug_from_href);

		if (cards.length === 0)
		{
			empty_pages++;
			console.log(`[${name}] Page ${page}: 0 cards (${empty_pages}/${EMPTY_PAGE_STREAK} empty streak).`);
			page++;
			await sleep(req_delay_ms);
			continue;
		}
		empty_pages = 0; // reset when we get cards again

		if (state)
		{
			const page_has_new_or_changed = cards.some(card =>
			{
				const prev = state[card.slug];
				return !prev || card.max_chapter > (prev.max_chapter ?? -1);
			});

			if (page_has_new_or_changed)
			{
				unchanged_pages = 0;
			}
			else
			{
				unchanged_pages++;
				console.log(`[${name}] Page ${page}: all unchanged (${unchanged_pages}/${UNCHANGED_PAGE_STREAK}).`);
				if (unchanged_pages >= UNCHANGED_PAGE_STREAK)
				{
					console.log(`[${name}] ${UNCHANGED_PAGE_STREAK} consecutive unchanged pages -- stopping early.`);
					stop = true;
				}
			}
		}
		if (status_override)
			for (const card of cards) card.status = status_override;

		const added = add_cards(cards, all_series, seen_slugs);
		console.log(`[${name}] Page ${page}: ${cards.length} cards, ${added} new, total=${all_series.length}`);

		page++;
		await sleep(req_delay_ms);
	}

	const CONCURRENCY = 1;
	const to_fetch = state
		? all_series.filter(s =>
		{
			const prev = state[s.slug];
			if (!prev) return true;                          // brand new -- always fetch
			return s.max_chapter !== null && s.max_chapter > (prev.max_chapter ?? -1);
		})
		: all_series;
	if (state)
	{
		const to_fetch_set = new Set(to_fetch.map(s => s.slug));
		for (const s of all_series)
		{
			if (!to_fetch_set.has(s.slug))
				s.chapters[name] = null;
		}
	}

	if (status_only)
	{
		for (const s of all_series)
		{
			s.chapters[name] = null;
			const prev = state?.[s.slug];
			s.ua = prev?.ua ?? null;
			s.uf = prev?.uf ?? null;
			if (s.max_chapter !== null && s.max_chapter > (prev?.max_chapter ?? -1))
				s.uf = run;
		}
		console.log(`[${name}] Status-only: skipping chapter fetches for ${all_series.length} series.`);
	}
	else
	{
		console.log(`[${name}] Fetching chapters for ${to_fetch.length}/${all_series.length} changed series (concurrency=${CONCURRENCY})...`);

		for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
		{
			const batch = to_fetch.slice(i, i + CONCURRENCY);

			await Promise.all(batch.map(async (series) =>
			{
				const prev = state?.[series.slug];
				const { chapters, ua: site_ua } = await fetch_non_integer_chapters(series._series_url, name);
				if (chapters.length > 0)
					series.chapters[name] = chapters;
				series.ua = site_ua || prev?.ua || null;
				if (series.max_chapter !== null && series.max_chapter > (prev?.max_chapter ?? -1))
					series.uf = run;
				else
					series.uf = prev?.uf ?? null;
			}));

			console.log(`[${name}] Chapters: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
			if (i + CONCURRENCY < to_fetch.length) await sleep(req_delay_ms);
		}
		if (state)
		{
			const to_fetch_set = new Set(to_fetch.map(s => s.slug));
			for (const s of all_series)
			{
				if (!to_fetch_set.has(s.slug))
				{
					const prev = state[s.slug];
					s.ua = prev?.ua ?? null;
					s.uf = prev?.uf ?? null;
				}
			}
		}
	}
	for (const s of all_series) delete s._series_url;

	console.log(`[${name}] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports =
{
	extract_status_from_card,
	extract_wp_cards,
	fetch_non_integer_chapters,
	scrape_wp_site,
};
