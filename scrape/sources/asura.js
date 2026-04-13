/*
 * scrape/sources/asura.js -- Asura Scans scraper
 *
 * Asura exposes a proper JSON API, which makes this the simplest scraper.
 *
 * SERIES LIST:
 *   GET https://api.asurascans.com/api/series?sort=latest&order=desc&limit=20&offset={n}
 *   Paginated in steps of 20. We keep fetching until the API returns an empty page.
 *   Each item includes title, slug, cover, latest_chapters, and chapter_count.
 *
 * CHAPTER SLUGS:
 *   For integer chapters we only store max_chapter (the chapter list is generated
 *   client-side from 1..max_chapter). For non-integer chapters (e.g. 12.5, 0),
 *   we fetch the full chapter list from the series endpoint and store only those
 *   entries, because their slugs cannot be guessed from the number alone.
 *
 * is_non_integer():
 *   Returns true for chapter numbers that are not whole integers, including 0
 *   (prologue chapters). These need explicit slug storage because the front-end
 *   cannot reconstruct their URLs from the chapter number alone.
 */

const { fetch } = require('./helpers');

// Returns true if num is a valid number that is NOT a positive integer.
// This catches decimals (12.5) and chapter 0 (prologue).
function is_non_integer(num)
{
    const n = parseFloat(num);
    return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

// Fetch the full chapter list for a single series from the Asura API.
// Returns an array of { name, chapter_slug, number } objects.
// Returns [] on any error so a single failing series does not abort the whole scrape.
async function fetch_series_chapters(slug)
{
    try
    {
        const url = `https://api.asurascans.com/api/series/${slug}/chapters`;
        const res = await fetch(url);
        if (res.status !== 200) return [];

        const json        = JSON.parse(res.body);
        const chaptersData = json.data || [];
        return chaptersData.map(ch => ({
            name:         ch.title || `Chapter ${ch.number}`,
            chapter_slug: ch.slug,
            number:       ch.number,
        }));
    }
    catch (e)
    {
        console.error(`[Asura] Failed chapters for ${slug}: ${e.message}`);
        return [];
    }
}

async function scrape_asura()
{
    console.log('[Asura] Starting...');
    const series   = [];
    const base_url = 'https://api.asurascans.com/api/series?sort=latest&order=desc&limit=20';
    let offset     = 0;

    // How many series to fetch chapter details for in parallel.
    // Keep this low to avoid hammering the Asura API.
    const CONCURRENCY = 5;

    // Page through the series list until the API returns an empty page.
    while (true)
    {
        const url = `${base_url}&offset=${offset}`;
        console.log(`[Asura] Fetching offset=${offset}, total=${series.length}`);

        let res;
        try
        {
            res = await fetch(url);
        }
        catch (e)
        {
            console.error(`[Asura] Fetch error: ${e.message}`);
            break;
        }

        if (res.status !== 200)
        {
            console.error(`[Asura] HTTP ${res.status}, stopping.`);
            break;
        }

        let json;
        try
        {
            json = JSON.parse(res.body);
        }
        catch (e)
        {
            console.error(`[Asura] JSON parse error on ${url}`);
            break;
        }

        const items = json.data || [];
        if (items.length === 0)
        {
            console.log('[Asura] No more items.');
            break;
        }

        for (const item of items)
        {
            if (!item.slug || !item.title) continue;

            // Determine max_chapter from the latest_chapters array or chapter_count fallback.
            let max_chapter = null;

            if (Array.isArray(item.latest_chapters) && item.latest_chapters.length > 0)
            {
                for (const ch of item.latest_chapters)
                {
                    const n = parseFloat(ch.number ?? ch.chapter ?? '');
                    if (!isNaN(n) && (max_chapter === null || n > max_chapter)) max_chapter = n;
                }
            }

            if (max_chapter === null && item.chapter_count != null)
            {
                const n = parseFloat(item.chapter_count);
                if (!isNaN(n)) max_chapter = n;
            }

            series.push({
                title:      item.title,
                slug:       item.slug,
                cover:      item.cover || null,
                sources:    { 'Asura Scans': `https://asurascans.com/comics/${item.slug}` },
                max_chapter,
                chapters:   { 'Asura Scans': [] },
                _slug:      item.slug,  // temporary, deleted after chapter fetch
            });
        }

        offset += 20;
    }

    // Fetch and store non-integer chapter slugs in batches to avoid overloading the API.
    console.log(`[Asura] Fetching non-integer chapters for ${series.length} series (concurrency=${CONCURRENCY})...`);

    for (let i = 0; i < series.length; i += CONCURRENCY)
    {
        const batch = series.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async (s) => {
            const allChapters = await fetch_series_chapters(s._slug);
            const filtered    = allChapters.filter(ch => is_non_integer(ch.number));
            if (filtered.length) {
                s.chapters['Asura Scans'] = filtered.map(ch => ({
                    name:         String(ch.number),
                    chapter_slug: ch.chapter_slug,
                }));
            }
            // Remove the temporary _slug field before writing to series.json.
            delete s._slug;
        }));
        console.log(`[Asura] Chapters fetched: ${Math.min(i + CONCURRENCY, series.length)}/${series.length}`);
    }

    console.log(`[Asura] Done. Found ${series.length} series.`);
    return series;
}

module.exports = { scrape_asura };
