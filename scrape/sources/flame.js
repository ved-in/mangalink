const { fetch, sleep, decode_html_entities } = require('./helpers');

function strip_trailing_zeros(num_str)
{
    const n = parseFloat(num_str);
    if (isNaN(n)) return num_str;
    return n.toString();
}

async function scrape_flame()
{
    console.log('[Flame] Starting...');

    // fetch buildId from homepage __NEXT_DATA__
    // I love you https://github.com/keiyoushi/extensions-source

    const home_res = await fetch('https://flamecomics.xyz');
    const build_id_match = home_res.body.match(/"buildId"\s*:\s*"([^"]+)"/);
    if (!build_id_match)
    {
        console.error('[Flame] Could not extract buildId');
        return [];
    }
    const buildId = build_id_match[1];
    console.log(`[Flame] buildId: ${buildId}`);

    // fetch series list
    const series_res = await fetch('https://flamecomics.xyz/api/series');
    const series_list = JSON.parse(series_res.body);
    console.log(`[Flame] Found ${series_list.length} series`);

    const all_series = [];
    for (const item of series_list)
    {
        const id = item.id;
        const title = item.label;
        if (!id || !title) continue;

        console.log(`[Flame] Processing: ${title} (id=${id})`);

        // Step 3: fetch chapter list + series info
        const ch_url = `https://flamecomics.xyz/_next/data/${buildId}/series/${id}.json?id=${id}`;
        let chapters = [];
        let cover_url = null;
        try
        {
            const ch_res = await fetch(ch_url);
            if (ch_res.status === 200)
            {
                const ch_data = JSON.parse(ch_res.body);
                const series_info = ch_data?.pageProps?.series;

                if (series_info && series_info.cover)
                {
                    // Build absolute cover URL using CDN
                    cover_url = `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${series_info.cover}`;
                }

                const allChapters = (ch_data?.pageProps?.chapters || []).map(
                    ch => (
                        {
                            name: String(ch.chapter),
                            chapter_slug: ch.token,
                            number: parseFloat(ch.chapter)
                        }
                    )
                );
                chapters = allChapters.map(
                    ch => (
                        {
                            name: strip_trailing_zeros(ch.name),
                            chapter_slug: ch.chapter_slug
                        }
                    )
                );
            }
        }
        catch (e)
        {
            console.error(`[Flame] error: ${e.message}`);
            return []
        }

        // Fallback cover if not found: use item.image (relative) and try to make absolute
        if (!cover_url && item.image)
        {
            cover_url = `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${item.image}`;
        }

        all_series.push(
            {
                title: decode_html_entities(title),
                slug: `https://flamecomics.xyz/series/${id}`,
                cover: cover_url,
                sources: { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
                flame_series_id: id,
                max_chapter: item.chapter_count ? parseFloat(item.chapter_count) : null,
                chapters: { 'Flame Comics': chapters },
            }
        );

        await sleep(500); // rate limit, 2 req/s per the Tachiyomi extension
    }

    console.log(`[Flame] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_flame };