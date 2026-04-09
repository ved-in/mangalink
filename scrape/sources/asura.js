const { fetch } = require('./helpers');

async function scrape_asura()
{
    console.log('[Asura] Starting...');
    const series = [];
    const base_url = 'https://api.asurascans.com/api/series?sort=latest&order=desc&limit=20';
    let offset = 0;

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

            series.push(
                {
                    title: item.title,
                    slug: item.slug,
                    cover: item.cover || null,
                    sources: ['Asura Scans'],
                    max_chapter,
                }
            );
        }

        offset += 20;
    }

    console.log(`[Asura] Done. Found ${series.length} series.`);
    return series;
}

module.exports = { scrape_asura };