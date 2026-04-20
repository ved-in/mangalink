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
 * CONCURRENCY:
 *   The series page chapter fetch uses CONCURRENCY=200 because Demonic's server
 *   is fast and handles many simultaneous connections without rate-limiting.
 */

const { fetch, decode_html_entities, add_cards } = require('./helpers');
const cheerio = require('cheerio');

// Returns true for chapter numbers that are not positive integers (including 0).
function is_non_integer(num)
{
    const n = parseFloat(num);
    return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

// Parse a single "last updates" page HTML and extract series cards.
// Returns an array of card objects ready to be merged into all_series.
function extract_demonic_cards(html)
{
    const cards       = [];
    const seen_slugs  = new Set();
    const $           = cheerio.load(html);

    $('.updates-element').each((_, container) => {
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

        $(container).find('a.chplinks').each((_, a) => {
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
// Reads chapter links and returns { number } objects for non-integer entries.
async function fetch_series_chapters(series_url)
{
    try
    {
        const res = await fetch(series_url);
        if (res.status !== 200) return [];

        const $        = cheerio.load(res.body);
        const chapters = [];
        const seen     = new Set();

        $('a.chplinks').each((_, a) => {
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

async function scrape_demonic()
{
    console.log('[Demonic] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    // Fetch listing pages in batches of 30. Stop when 5+ consecutive batches
    // return zero new cards (indicating we have reached the end of the listing).
    const BATCH = 30;
    let list_num = 1;
    let stop     = false;

    while (!stop)
    {
        const batch_nums = Array.from({ length: BATCH }, (_, i) => list_num + i);
        const results    = await Promise.all(
            batch_nums.map(async (n) => {
                const url = `https://demonicscans.org/lastupdates.php?list=${n}`;
                try {
                    const res = await fetch(url);
                    if (res.status !== 200) return { n, cards: [] };
                    return { n, cards: extract_demonic_cards(res.body) };
                } catch (e) {
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
    }

    // Fetch non-integer chapter data for all series.
    // High concurrency is safe here -- Demonic handles it well.
    const CONCURRENCY = 200;
    console.log(`[Demonic] Fetching chapter data for ${all_series.length} series (concurrency=${CONCURRENCY})...`);

    for (let i = 0; i < all_series.length; i += CONCURRENCY)
    {
        const batch = all_series.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (s) => {
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
        console.log(`[Demonic] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
    }

    console.log(`[Demonic] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_demonic };
