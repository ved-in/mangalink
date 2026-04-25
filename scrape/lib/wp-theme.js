/**
 * scrape/lib/wp-theme.js
 *
 * Shared scraper engine for sites built on the Madara/MangaStream WordPress
 * manga theme. Thunder Scans, Violet Scans, and ADK Scans all use this theme
 * (or a close fork), so 95% of their scraping logic is identical.
 *
 * What this file provides:
 *   - extract_status_from_card()  reads status from a card's CSS class
 *   - extract_wp_cards()          parses a listing page into card objects
 *   - fetch_non_integer_chapters() fetches a series page and returns non-integer chapters
 *   - scrape_wp_site()            full pagination + chapter-fetch loop, driven by a config object
 *
 * Each site-specific scraper (thunder/, violet/, adk/) just calls scrape_wp_site()
 * with its own config and gets back a ready-to-merge series array.
 *
 * ── How the listing pagination works ──────────────────────────────────────────
 *
 * The theme serves a paginated listing at:
 *   GET {base_url}/?page={n}     (Thunder, Violet)
 *   GET {base_url}/?page={n}     (ADK uses /manga/ base instead of /comics/)
 *
 * We stop paginating when either:
 *   a) UNCHANGED_PAGE_STREAK consecutive pages have NO new/changed series
 *      (incremental mode -- all recent updates already in state)
 *   b) EMPTY_PAGE_STREAK consecutive pages return zero cards
 *      (we have reached the end of the catalogue)
 *
 * ── .epxs quirk ───────────────────────────────────────────────────────────────
 *
 * The latest-chapter label is inside a <div class="epxs">...</div> that is
 * rendered as an HTML COMMENT on Thunder and Violet (but NOT on ADK, where
 * cheerio can see it normally). To handle both cases we extract .epxs values
 * from the raw HTML string with a regex before passing the HTML to cheerio,
 * then align them with cards by index.
 */

const cheerio = require('cheerio');
const { http_get_with_retry, sleep, decode_html_entities, add_cards,
        is_non_integer_chapter, parse_chapter_label } = require('./helpers');

// ── Card parsing ──────────────────────────────────────────────────────────────

/**
 * Read the series status from a card element.
 *
 * The theme uses two different patterns depending on the fork:
 *
 *   Pattern A (older forks): CSS class on the card or an inner element.
 *     e.g. <div class="bsx status-ongoing">  or  <span class="status-ongoing">
 *
 *   Pattern B (Thunder, Violet, ADK): a dedicated status div with a dot span.
 *     <div class="status">
 *       <span class="status-dot Ongoing"></span> <i>Ongoing</i>
 *     </div>
 *     The status word is the second class on the span AND the text of the <i> tag.
 *     We read the <i> tag text since it's the most straightforward.
 *
 * Returns null when neither pattern matches.
 */
function extract_status_from_card($el, $)
{
	// Pattern B: <div class="status"> ... <i>Ongoing</i>
	const status_text = $el.find('div.status i').first().text().trim();
	if (status_text)
	{
		const l = status_text.toLowerCase();
		if (l === 'ongoing')   return 'Ongoing';
		if (l === 'completed') return 'Completed';
		if (l === 'hiatus')    return 'Hiatus';
		if (l === 'dropped')   return 'Dropped';
	}

	// Pattern A: status class on the card element itself or an inner element.
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

/**
 * Parse all manga cards from a single listing page HTML string.
 *
 * @param {string}   html       Raw HTML from the listing page.
 * @param {string}   source_name  e.g. "Thunder Scans" -- used as the sources key.
 * @param {string}   base_url   e.g. "https://en-thunderscans.com" -- for relative links.
 * @param {Set}      seen_slugs  Slugs already collected; used to skip duplicates.
 * @param {Function} [slug_from_href]  Optional override: given an href, return the slug.
 *                               Default: extract last path segment from /comics/ URL.
 * @returns {Array}  Array of card objects ready for add_cards().
 */
function extract_wp_cards(html, source_name, base_url, seen_slugs, slug_from_href)
{
	const $ = cheerio.load(html);

	// .epxs labels are commented out in the DOM on some themes (Thunder, Violet).
	// Extract them from the raw HTML string by position so we can align with cards.
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

		// Derive the dedup slug from the href, always lowercased.
		// Lowercase is critical: state keys are written lowercase in build_state(),
		// so the lookup in the incremental check must also use lowercase.
		const raw_slug = (slug_from_href
			? slug_from_href(href)
			: (href.match(/\/comics\/([^\/]+)\/?/)?.[1] ?? null)
		)?.toLowerCase();

		if (!raw_slug || seen_slugs.has(raw_slug)) { card_idx++; return; }

		// Normalise the series URL to always have a trailing slash.
		const series_url = href.endsWith('/') ? href : href + '/';

		// Title: prefer the anchor's title= attribute (never truncated by CSS).
		const title =
			link.attr('title') ||
			$el.find('.tt').text().trim() ||
			raw_slug.replace(/-/g, ' ');

		// Cover: try the theme's standard location first, then any img.
		const cover =
			$el.find('.limit img').attr('src') ||
			$el.find('img').first().attr('src') ||
			null;

		// Chapter label from the pre-extracted .epxs array (aligned by index).
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

// ── Chapter fetching ──────────────────────────────────────────────────────────

/**
 * Fetch the chapter list for one series page and return only non-integer chapters.
 *
 * Why only non-integer?
 *   Integer chapter URLs (e.g. /series/slug/chapter-5/) can be constructed on the
 *   front-end from just the chapter number. Non-integer chapters (12.5, 0) need
 *   their explicit slug stored because the URL cannot be guessed.
 *
 * @param {string} series_url  Full URL of the series page.
 * @param {string} source_name Used in the error log.
 * @returns {Promise<Array<{ name: string, chapter_slug: string }>>}
 */
async function fetch_non_integer_chapters(series_url, source_name)
{
	try
	{
		const { status, body } = await http_get_with_retry(series_url);
		if (status !== 200) return [];

		const $        = cheerio.load(body);
		const chapters = [];

		$('#chapterlist ul li').each((_, li) =>
		{
			const num  = $(li).attr('data-num');
			const href = $(li).find('a[href]').first().attr('href');
			if (!num || !href) return;

			if (!is_non_integer_chapter(parseFloat(num))) return;

			// The chapter slug is the last path segment of the chapter URL.
			const ch_slug = href.replace(/\/$/, '').split('/').pop();
			chapters.push({
				name:         String(parseFloat(num)),
				chapter_slug: ch_slug,
			});
		});

		return chapters;
	}
	catch (e)
	{
		console.error(`[${source_name}] Chapter fetch failed for ${series_url}: ${e.message}`);
		return [];
	}
}

// ── Main scrape loop ──────────────────────────────────────────────────────────

/**
 * Full scrape for one WordPress-theme manga site.
 *
 * config shape:
 * {
 *   name:            string   -- display name, e.g. "Thunder Scans"
 *   listing_url:     string   -- e.g. "https://en-thunderscans.com/comics/?page="
 *                                The page number is appended directly.
 *   slug_from_href:  Function -- optional, see extract_wp_cards()
 *   state:           object   -- scrape_state from the previous run (or null)
 *   req_delay_ms:    number   -- sleep between page fetches (default 500)
 * }
 *
 * Returns an array of series objects ready for merge().
 */
async function scrape_wp_site(config)
{
	const {
		name,
		listing_url,
		slug_from_href  = null,
		state           = null,
		req_delay_ms    = 500,
		status_override = null, // when set, overrides per-card status extraction
	} = config;

	// How many consecutive unchanged pages before we assume nothing new is left.
	const UNCHANGED_PAGE_STREAK = 3;
	// How many consecutive empty pages before we assume the catalogue has ended.
	const EMPTY_PAGE_STREAK     = 5;

	const all_series       = [];
	const seen_slugs       = new Set();
	let   page             = 1;
	let   unchanged_pages  = 0; // pages where every card's max_chapter is already in state
	let   empty_pages      = 0; // pages that returned zero cards (end-of-catalogue signal)
	let   stop             = false;

	console.log(`[${name}] Starting...`);

	// ── Listing pagination loop ────────────────────────────────────────────────

	while (!stop && empty_pages < EMPTY_PAGE_STREAK)
	{
		const url = `${listing_url}${page}`;
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
		// Note: we pass a fresh Set() to extract_wp_cards because seen_slugs is
		// managed here at the loop level (add_cards handles the real dedup below).

		if (cards.length === 0)
		{
			empty_pages++;
			console.log(`[${name}] Page ${page}: 0 cards (${empty_pages}/${EMPTY_PAGE_STREAK} empty streak).`);
			page++;
			await sleep(req_delay_ms);
			continue;
		}
		empty_pages = 0; // reset when we get cards again

		// ── Incremental stop check ─────────────────────────────────────────────
		// If we have state from a previous run, check whether this entire page is
		// already known and unchanged. Once UNCHANGED_PAGE_STREAK consecutive pages
		// are all stale, everything deeper in the listing is older -- stop early.

		if (state)
		{
			const page_has_new_or_changed = cards.some(card =>
			{
				const prev = state[card.slug];
				// A card is "changed" only if the listing shows a chapter newer than stored.
				// Use > not !== so decimal sub-chapters in state (e.g. 200.5) don't cause
				// false positives when the listing shows the integer chapter (200).
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
					// Still add this page's cards before breaking (they belong in all_series
					// so that their status updates propagate even without chapter re-fetches).
				}
			}
		}

		// Apply status_override if set (used by ADK per-filter fetches).
		if (status_override)
			for (const card of cards) card.status = status_override;

		const added = add_cards(cards, all_series, seen_slugs);
		console.log(`[${name}] Page ${page}: ${cards.length} cards, ${added} new, total=${all_series.length}`);

		page++;
		await sleep(req_delay_ms);
	}

	// ── Chapter fetch phase ───────────────────────────────────────────────────
	// Only fetch chapters for series whose max_chapter changed since last run.
	// For brand-new series (not in state) we always fetch.
	// Chapters are fetched in small parallel batches to keep concurrency low.

	const CONCURRENCY = 5;

	// A series needs a chapter re-fetch if it is brand-new (not in state) OR
	// if its max_chapter actually changed. For sites where max_chapter is null
	// on the listing page (e.g. epxs values are unavailable), we fall back to
	// treating any series already in state as unchanged -- the stop-streak above
	// already ensured we only collected series from pages that had real changes.
	const to_fetch = state
		? all_series.filter(s =>
		{
			const prev = state[s.slug];
			if (!prev) return true;                          // brand new -- always fetch
			// Use > not !== so decimal sub-chapters in state don't cause false positives.
			// If max_chapter is null (epxs unavailable), trust the stop-streak check.
			return s.max_chapter !== null && s.max_chapter > (prev.max_chapter ?? -1);
		})
		: all_series;

	// Mark unchanged series with a null chapters sentinel so write_chunks
	// preserves their existing chapter data rather than overwriting with [].
	if (state)
	{
		const to_fetch_set = new Set(to_fetch.map(s => s.slug));
		for (const s of all_series)
		{
			if (!to_fetch_set.has(s.slug))
				s.chapters[name] = null;
		}
	}

	console.log(`[${name}] Fetching chapters for ${to_fetch.length}/${all_series.length} changed series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);

		await Promise.all(batch.map(async (series) =>
		{
			const chapters = await fetch_non_integer_chapters(series._series_url, name);
			if (chapters.length > 0)
			{
				series.chapters[name] = chapters;
			}
		}));

		console.log(`[${name}] Chapters: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
		if (i + CONCURRENCY < to_fetch.length) await sleep(req_delay_ms);
	}

	// Clean up the temporary _series_url field from all entries.
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
