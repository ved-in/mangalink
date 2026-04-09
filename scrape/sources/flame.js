const { fetch, decode_html_entities } = require('./helpers');

async function scrape_flame()
{
    console.log('[Flame] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    try
    {
        const url = 'https://flamecomics.xyz/api/series';
        const res = await fetch(url);

        if (res.status !== 200)
        {
            console.error(`[Flame] HTTP ${res.status}`);
            return [];
        }

        let data;
        try
        {
            data = JSON.parse(res.body);
        }
        catch (e)
        {
            console.error(`[Flame] JSON parse error: ${e.message}`);
            return [];
        }

        if (!Array.isArray(data))
        {
            console.error('[Flame] API did not return an array');
            return [];
        }

        for (const item of data)
        {
            const id = item.id;
            const title = item.label;
            if (!id || !title) continue;

            const slug = `https://flamecomics.xyz/series/${id}`;
            if (seen_slugs.has(slug)) continue;
            seen_slugs.add(slug);

            let cover = item.image;
            if (cover && !cover.startsWith('http'))
            {
                cover = 'https://flamecomics.xyz/' + cover.replace(/^\/+/, '');
            }
            // chapter_count comes back as a string in the API response
            const max_chapter = item.chapter_count != null
                ? parseFloat(item.chapter_count) || null
                : null;

            all_series.push(
                {
                    title: decode_html_entities(title),
                    slug: slug,
                    cover: cover || null,
                    sources: ['Flame Comics'],
                    flame_series_id: id,
                    max_chapter,
                }
            );
        }

        console.log(`[Flame] Found ${all_series.length} series.`);
    }
    catch (e)
    {
        console.error(`[Flame] Error: ${e.message}`);
    }

    console.log(`[Flame] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_flame };