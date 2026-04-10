const { fetch } = require('./helpers');

function is_non_integer(num)
{
    const n = parseFloat(num);
    return !isNaN(n) && n % 1 !== 0;
}

async function fetch_series_chapters(slug)
{
    try
    {
        const url = `https://api.asurascans.com/api/series/${slug}/chapters`;
        const res = await fetch(url);
        if (res.status !== 200) return [];

        const json = JSON.parse(res.body);
        const chaptersData = json.data || [];
        return chaptersData.map(
            ch => (
                {
                    name: ch.title || `Chapter ${ch.number}`,
                    chapter_slug: ch.slug,
                    number: ch.number
                }
            )
        );
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
    const series = [];
    const base_url = 'https://api.asurascans.com/api/series?sort=latest&order=desc&limit=20';
    let offset = 0;
    const CONCURRENCY = 5;

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

            let max_chapter = null;

            if (Array.isArray(item.latest_chapters) && item.latest_chapters.length > 0)
            {
                // Find the highest number across the returned latest chapters
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

            const series_url = `https://asurascans.com/comics/${item.slug}`;

            series.push(
                {
                    title: item.title,
                    slug: item.slug,
                    cover: item.cover || null,
                    sources: { 'Asura Scans': series_url },
                    max_chapter,
                    chapters: { 'Asura Scans': [] },
                    _slug: item.slug
                }
            );
        }

        offset += 20;
    }

    console.log(`[Asura] Fetching non-integer chapters for ${series.length} series (concurrency=${CONCURRENCY})...`);
    
    for (let i = 0; i < series.length; i += CONCURRENCY)
    {
        const batch = series.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(
            async (s) => {
                const allChapters = await fetch_series_chapters(s._slug);
                const filtered = allChapters.filter(ch => is_non_integer(ch.number));
                if (filtered.length) {
                    s.chapters['Asura Scans'] = filtered.map(ch => ({
                        name: String(ch.number),           // Use the chapter number as the name
                        chapter_slug: ch.chapter_slug
                    }));
                }
                delete s._slug;
            }
        ));
        console.log(`[Asura] Chapters fetched: ${Math.min(i + CONCURRENCY, series.length)}/${series.length}`);
    }

    console.log(`[Asura] Done. Found ${series.length} series.`);
    return series;
}

module.exports = { scrape_asura };