/*
 * scrape/sources/demonic.js -- Demonic Scans scraper
 *
 * Demonic does not have an API. We scrape their "last updated" listing pages.
 *
 * SERIES LIST:
 *   GET https://demonicscans.org/lastupdates.php?list={n}
 *   Each page contains ".updates-element" cards. We fetch 30 pages in parallel
 *   and stop when 5 consecutive batches return no new cards.
 *   Cards include the series slug, title, cover, and chapter links with numeric IDs.
 *
 * NUMERIC MANGA ID (demonic_id):
 *   Demonic chapter URLs use a numeric manga ID (e.g. "chaptered.php?manga=832&chapter=5").
 *   We extract this ID from the chapter link hrefs on the listing card.
 *   The ID is stored as demonic_id and used by the front-end to build cleaner URLs.
 *
 * MAX CHAPTER:
 *   Scraped from the chapter link hrefs on the listing card (the highest chapter= value).
 *
 * NON-INTEGER CHAPTERS:
 *   Fetched from the individual series page by following its chapter links.
 *   Only non-integer chapters are stored since integer URLs can be constructed
 *   from the demonic_id.
 *
 * STATUS:
 *   Demonic does not expose status on the listing page.  We skip it here; the
 *   merge step in scrape.js will preserve whatever status was set by another source.
 *
 * INCREMENTAL MODE (quick):
 *   The lastupdates pages are ordered by most-recently-updated first.
 *   We stop after STOP_STREAK consecutive cards whose max_chapter matches the
 *   stored state -- everything deeper on the listing is older.
 *   Additionally, in quick mode we skip all series whose stored status is
 *   "Completed" or "Dropped" -- they will not gain new chapters.
 *   Chapter page fetches are limited to series that changed.
 *
 * DEEP MODE:
 *   Falls back to the original full-catalogue scrape with BATCH=30 parallel
 *   listing fetches.  Uses req_delay_ms between batches for rate limiting.
 */

const { fetch, decode_html_entities, add_cards } = require('./helpers');
const cheerio = require('cheerio');

// Returns true for chapter numbers that are not positive integers (including 0).
function is_non_integer(num)
{
	const n = parseFloat(num);
	return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

// Statuses that mean a series will never get new chapters.
// In quick mode we skip fetching these entirely.
const TERMINAL_STATUSES = new Set(['Completed', 'Dropped']);

// Parse a single "last updates" page HTML and extract series cards.
// Returns an array of card objects ready to be merged into all_series.
function extract_demonic_cards(html)
{
	const cards       = [];
	const seen_slugs  = new Set();
	const $           = cheerio.load(html);

	$('.updates-element').each((_, container) =>
	{
		const link = $(container).find('a[href^="/manga/"]').first();
		if (!link.length) return;

		const href = link.attr('href');
		const slug = href.replace('/manga/', '').replace(/\/$/, '');
		if (seen_slugs.has(slug)) return;

		// Prefer the title= attribute (full title). Fall back to text content
		// which is often truncated with "..." on small cards.
		let title = link.attr('title');
		if (!title) title = $(container).find('h2, .tt').first().text().trim();
		if (!title) title = slug.replace(/-/g, ' ');

		let cover = $(container).find('.thumb img, img').first().attr('src');

		// Extract the numeric manga ID and highest chapter number from the chapter links.
		let max_chapter = null;
		let manga_id    = null;

		$(container).find('a.chplinks').each((_, a) =>
		{
			const chap_href = $(a).attr('href') || '';

			// Grab manga ID from the first chapter link that has one.
			if (!manga_id)
			{
				const id_match = chap_href.match(/[?&]manga=(\d+)/);
				if (id_match) manga_id = id_match[1];
			}

			// Track the highest chapter number seen on this card.
			const m = chap_href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
			if (m)
			{
				const n = parseFloat(m[1]);
				if (max_chapter === null || n > max_chapter) max_chapter = n;
			}
		});

		seen_slugs.add(slug);
		cards.push({
			title:       decode_html_entities(title),
			slug,
			cover,
			status:      null,   // Demonic listing page has no status field
			sources:     { 'Demonic Scans': `https://demonicscans.org/manga/${slug}` },
			max_chapter,
			demonic_id:  manga_id,
			chapters:    { 'Demonic Scans': [] },
			_series_url: `https://demonicscans.org/manga/${slug}`,  // temporary
		});
	});

	return cards;
}

// Fetch non-integer chapters for a single series page.
async function fetch_series_chapters(series_url)
{
	try
	{
		const res = await fetch(series_url);
		if (res.status !== 200) return [];

		const $        = cheerio.load(res.body);
		const chapters = [];
		const seen     = new Set();

		$('a.chplinks').each((_, a) =>
		{
			const href     = $(a).attr('href') || '';
			const ch_match = href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
			if (!ch_match) return;
			const num = parseFloat(ch_match[1]);
			if (seen.has(num)) return;
			seen.add(num);
			chapters.push({ number: num });
		});

		return chapters;
	}
	catch (e)
	{
		console.error(`[Demonic] Failed chapters for ${series_url}: ${e.message}`);
		return [];
	}
}

// opts.state   -- scrape_state map (slug -> { max_chapter, status }) or null
// opts.is_quick -- true when running in quick mode
// opts.req_delay_ms -- milliseconds between page-batch fetches (deep mode rate limit)
async function scrape_demonic(opts = {})
{
	const state        = opts.state        || null;
	const is_quick     = opts.is_quick     || false;
	const req_delay_ms = opts.req_delay_ms || 0;

	console.log(`[Demonic] Starting (mode=${is_quick ? 'quick' : 'deep'})...`);
	const all_series = [];
	const seen_slugs = new Set();

	if (is_quick)
	{
		// ----------------------------------------------------------------
		// QUICK MODE: page through lastupdates sequentially (no big batches)
		// and stop early once STOP_STREAK consecutive unchanged cards are seen.
		// ----------------------------------------------------------------
		const STOP_STREAK = 5;
		let   stop_count  = 0;
		let   list_num    = 1;
		let   keep_going  = true;

		while (keep_going)
		{
			const url = `https://demonicscans.org/lastupdates.php?list=${list_num}`;
			console.log(`[Demonic] Quick fetch list=${list_num}, total=${all_series.length}`);

			let cards = [];
			try
			{
				const res = await fetch(url);
				if (res.status === 200) cards = extract_demonic_cards(res.body);
			}
			catch (e)
			{
				console.error(`[Demonic] Fetch error list=${list_num}: ${e.message}`);
			}

			if (cards.length === 0)
			{
				console.log('[Demonic] Empty page -- stopping.');
				break;
			}

			for (const card of cards)
			{
				const prev = state ? state[card.slug] : null;

				// Skip terminal-status series in quick mode (they won't update).
				if (is_quick && prev && TERMINAL_STATUSES.has(prev.status))
				{
					continue;
				}

				if (prev && prev.max_chapter === card.max_chapter)
				{
					stop_count++;
					if (stop_count >= STOP_STREAK)
					{
						console.log(`[Demonic] ${STOP_STREAK} consecutive unchanged -- stopping early.`);
						keep_going = false;
						break;
					}
				}
				else
				{
					stop_count = 0;
				}

				if (!seen_slugs.has(card.slug))
				{
					seen_slugs.add(card.slug);
					all_series.push(card);
				}
			}

			list_num++;
		}
	}
	else
	{
		// ----------------------------------------------------------------
		// DEEP MODE: fetch listing pages in batches of 30 (original logic).
		// Stop when 5+ consecutive batches return zero new cards.
		// ----------------------------------------------------------------
		const BATCH = 30;
		let list_num = 1;
		let stop     = false;

		while (!stop)
		{
			const batch_nums = Array.from({ length: BATCH }, (_, i) => list_num + i);
			const results    = await Promise.all(
				batch_nums.map(async (n) =>
				{
					const url = `https://demonicscans.org/lastupdates.php?list=${n}`;
					try
					{
						const res = await fetch(url);
						if (res.status !== 200) return { n, cards: [] };
						return { n, cards: extract_demonic_cards(res.body) };
					}
					catch (e)
					{
						console.error(`[Demonic] Fetch error list=${n}: ${e.message}`);
						return { n, cards: [] };
					}
				})
			);

			let empty_count = 0;
			for (const { n, cards } of results)
			{
				const added = add_cards(cards, all_series, seen_slugs);
				console.log(`[Demonic] list=${n}: ${cards.length} cards, ${added} new, total=${all_series.length}`);
				if (cards.length === 0) empty_count++;
			}

			// If every page in this batch was empty, we have exhausted the listing.
			if (empty_count >= 5) stop = true;
			list_num += BATCH;

			if (req_delay_ms > 0 && !stop)
			{
				const { sleep } = require('./helpers');
				await sleep(req_delay_ms);
			}
		}
	}

	// Fetch non-integer chapter data for changed series (or all in deep mode).
	// Quick mode: skip terminal-status series and unchanged series.
	const CONCURRENCY = is_quick ? 10 : 200;

	const to_fetch = is_quick && state
		? all_series.filter(s =>
		{
			const p = state[s.slug];
			if (p && TERMINAL_STATUSES.has(p.status)) return false;
			return !p || p.max_chapter !== s.max_chapter;
		})
		: all_series;

	console.log(`[Demonic] Fetching chapter data for ${to_fetch.length}/${all_series.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < to_fetch.length; i += CONCURRENCY)
	{
		const batch = to_fetch.slice(i, i + CONCURRENCY);
		await Promise.all(batch.map(async (s) =>
		{
			const all_chapters = await fetch_series_chapters(s._series_url);
			const filtered     = all_chapters.filter(ch => is_non_integer(ch.number));
			if (filtered.length)
			{
				s.chapters['Demonic Scans'] = filtered.map(ch => ({
					name:           String(ch.number),
					chapter_number: ch.number,
				}));
			}
			delete s._series_url;
		}));
		console.log(`[Demonic] Chapters fetched: ${Math.min(i + CONCURRENCY, to_fetch.length)}/${to_fetch.length}`);
	}

	// Clean up _series_url on entries not in to_fetch.
	for (const s of all_series) delete s._series_url;

	console.log(`[Demonic] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_demonic };
