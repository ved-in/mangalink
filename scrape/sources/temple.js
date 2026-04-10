/*
SUPPOSEDLYYYY, The source code of the url https://templetoons.com/comics contains a json named allComics...
Just look at its formatting...
{\"allComics\":[{\"title\":\"Our temperature!\",\"series_slug\":\"our-temperature\",\"thumbnail\":\"https://media.templetoons.com/file/terms54/covers/2b545a75-c404-49cc-bbbe-cea47c7220ce.webp\",\"badge\":\"Manhwa +18\",\"status\":\"Ongoing\",\"created_at\":\"2026-01-20T18:50:48.332Z\",\"alternative_names\":\"우리온도!, 我们的温度, हमारा तापमान, Notre température, ¡Nuestra temperatura!\",\"update_chapter\":\"2026-04-08T21:58:08.449Z\",\"total_views\":479837,\"Chapter\":[{\"chapter_name\":\"Chapter 12\",\"chapter_slug\":\"chapter-12\",\"created_at\":\"2026-04-08T03:29:15.787Z\"},{\"chapter_name\":\"Chapter 11\",\"chapter_slug\":\"chapter-11\",\"created_at\":\"2026-03-31T20:41:41.780Z\"}],\"_count\":{\"Season\":1,\"Chapter\":12,\"tag_series\":4,\"bookmarks_users\":1382,\"series_users\":0}},

ITS ALL ONE FRIGGING LINE...
THE ENTIRE HTML IS 2 LINES!!!!

the 1st line has ALLLL the html elements + the css INLINEEE...
the 2nd line is the script..

WOWWW
This took me like 4 hours to figure out...
I tried grabbing the allComics json.. then saw the unholy amount of escape characters... then tried to parse it entirely... wasted 3 hours on all this
then FINALLY I thought of just using BASIC regex... WOW
*/

const { fetch, sleep, decode_html_entities, add_cards } = require('./helpers');
const CONCURRENCY = 5;

function parse_chapter_slug(slug)
{
    if (!slug) return null;
    const clean = slug.replace(/^\d+-/, '');
    const stripped = clean.replace(/^(?:chapter|ch|episode|ep)-/i, '');
    const normalised = stripped.replace(/-(\d+)$/, '.$1');
    const n = parseFloat(normalised);
    return isNaN(n) ? null : n;
}

async function fetch_all_chapters(series_url)
{
    try
    {
        const res = await fetch(series_url);
        if (res.status !== 200) return [];

        const html = res.body;
        const chapters = [];
        const pattern = /\\"chapter_name\\":\\"([^\\"]+)\\".*?\\"chapter_slug\\":\\"([^\\"]+)\\"/g;
        let m;
        while ((m = pattern.exec(html)) !== null)
        {
            chapters.push({
                name:         m[1],
                chapter_slug: m[2],
            });
        }

        chapters.reverse();
        return chapters;
    }
    catch (e)
    {
        console.error(`[Temple] Failed to fetch chapters for ${series_url}: ${e.message}`);
        return [];
    }
}

async function scrape_temple_toons()
{
    console.log('[Temple] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    try
    {
        const res = await fetch('https://templetoons.com/comics');
        if (res.status !== 200)
        {
            console.error(`[Temple] HTTP ${res.status}`);
            return [];
        }

        const html = res.body;

        const slug_pattern = /\\\"series_slug\\\":\\\"([a-z0-9\-]+)\\\"/g;
        const title_pattern = /\\\"title\\\":\\\"([^\\]+)\\\"/g;
        const thumb_pattern = /\\\"thumbnail\\\":\\\"(https:[^\\]+)\\\"/g;
        const ccount_pattern = /\\\"_count\\\":\\\{[^}]*\\\"Chapter\\\":(\\d+)/g;

        let slug_matches = [];
        let title_matches = [];
        let thumb_matches = [];
        let ccount_matches = [];

        let match;
        while ((match = slug_pattern.exec(html)) !== null) slug_matches.push(match[1]);
        while ((match = title_pattern.exec(html)) !== null) title_matches.push(match[1]);
        while ((match = thumb_pattern.exec(html)) !== null) thumb_matches.push(match[1]);
        while ((match = ccount_pattern.exec(html)) !== null) ccount_matches.push(parseInt(match[1], 10));

        console.log(`[Temple] slugs=${slug_matches.length}, titles=${title_matches.length}, thumbs=${thumb_matches.length}`);

        if (slug_matches.length !== title_matches.length || slug_matches.length !== thumb_matches.length)
        {
            console.error(`[Temple] Length mismatch\n\tslugs: ${slug_matches.length},\n\ttitles: ${title_matches.length},\n\tthumbs: ${thumb_matches.length}`);
            console.error('[Temple] Aborting extraction to prevent data corruption');
            return [];
        }
        
        const count = slug_matches.length;
        for (let i = 0; i < count; i++)
        {
            const series_slug = slug_matches[i];
            const title = title_matches[i];
            const cover = thumb_matches[i];

            if (!series_slug || seen_slugs.has(series_slug)) continue;
            if (!title || title.length <= 1) continue;

            const series_url = `https://templetoons.com/comic/${series_slug}`;

            seen_slugs.add(series_slug);
            all_series.push({
                title:       decode_html_entities(title),
                slug:        series_url,
                cover,
                sources:     { 'Temple Toons': series_url },
                chapters:    { 'Temple Toons': [] },
                max_chapter: ccount_matches[i] ?? null,
                _series_url: series_url,
            });
        }

        console.log(`[Temple] Fetching chapters for ${all_series.length} series...`);

        for (let i = 0; i < all_series.length; i += CONCURRENCY)
        {
            const batch = all_series.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (s) =>
            {
                const chapters = await fetch_all_chapters(s._series_url);
                if (chapters.length > 0)
                {
                    s.chapters['Temple Toons'] = chapters;
                    let max = null;
                    for (const ch of chapters)
                    {
                        const n = parse_chapter_slug(ch.chapter_slug);
                        if (n !== null && (max === null || n > max)) max = n;
                    }
                    if (max !== null) s.max_chapter = max;
                }
            }));
            console.log(`[Temple] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
        }

        for (const s of all_series) delete s._series_url;
    }
    catch (e)
    {
        console.error(`[Temple] Error: ${e.message}`);
        console.error(e.stack);
        return [];
    }
    
    console.log(`[Temple] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_temple_toons };