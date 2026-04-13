/*
 * scrape/sources/flame.js -- Flame Comics scraper
 *
 * Flame Comics uses Next.js and exposes two useful endpoints:
 *
 *   1. GET https://flamecomics.xyz/api/series
 *      Returns a JSON array of all series with id, label, chapter_count, image.
 *
 *   2. GET https://flamecomics.xyz/_next/data/{buildId}/series/{id}.json?id={id}
 *      Returns full series info including cover URL and the chapter list with tokens.
 *
 * THE BUILD ID:
 *   Next.js embeds a buildId in its __NEXT_DATA__ JSON on every page. The data
 *   endpoint URL changes with each deployment. We extract the current buildId from
 *   the homepage HTML before fetching any series data.
 *   (Credit to the Tachiyomi/Mihon extension source for this approach.)
 *
 * CHAPTER TOKENS:
 *   Unlike other sources, Flame chapter URLs contain an unpredictable hex token
 *   (e.g. "a3f8c2d1") that cannot be guessed from the chapter number. We store
 *   every token in chapters["Flame Comics"] so the front-end can build exact URLs.
 *
 * RATE LIMITING:
 *   We sleep 500ms between series requests (2 req/s) to match the rate limit
 *   used by the Mihon extension.
 */

const { fetch, sleep, decode_html_entities } = require('./helpers');

// Strip unnecessary trailing zeros from a float string.
// e.g. "12.50" -> "12.5", "5.0" -> "5"
function strip_trailing_zeros(num_str)
{
    const n = parseFloat(num_str);
    if (isNaN(n)) return num_str;
    return n.toString();
}

async function scrape_flame()
{
    console.log('[Flame] Starting...');

    // Step 1: extract the current Next.js buildId from the homepage.
    // The buildId is embedded in a JSON blob: {"buildId":"abc123",...}
    const home_res      = await fetch('https://flamecomics.xyz');
    const build_id_match = home_res.body.match(/"buildId"\s*:\s*"([^"]+)"/);
    if (!build_id_match)
    {
        console.error('[Flame] Could not extract buildId');
        return [];
    }
    const buildId = build_id_match[1];
    console.log(`[Flame] buildId: ${buildId}`);

    // Step 2: fetch the full series list from the public API.
    const series_res  = await fetch('https://flamecomics.xyz/api/series');
    const series_list = JSON.parse(series_res.body);
    console.log(`[Flame] Found ${series_list.length} series`);

    const all_series = [];

    for (const item of series_list)
    {
        const id    = item.id;
        const title = item.label;
        if (!id || !title) continue;

        console.log(`[Flame] Processing: ${title} (id=${id})`);

        // Step 3: fetch chapter list and series metadata from the Next.js data endpoint.
        const ch_url   = `https://flamecomics.xyz/_next/data/${buildId}/series/${id}.json?id=${id}`;
        let chapters   = [];
        let cover_url  = null;

        try
        {
            const ch_res = await fetch(ch_url);
            if (ch_res.status === 200)
            {
                const ch_data    = JSON.parse(ch_res.body);
                const series_info = ch_data?.pageProps?.series;

                // Build the absolute cover URL using the CDN domain.
                if (series_info?.cover)
                {
                    cover_url = `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${series_info.cover}`;
                }

                // Store every chapter with its hex token so the front-end can build exact URLs.
                chapters = (ch_data?.pageProps?.chapters || []).map(ch => ({
                    name:         strip_trailing_zeros(String(ch.chapter)),
                    chapter_slug: ch.token,
                }));
            }
        }
        catch (e)
        {
            console.error(`[Flame] error: ${e.message}`);
            return [];
        }

        // Use the item.image field as a fallback cover if the series page had none.
        if (!cover_url && item.image)
        {
            cover_url = `https://cdn.flamecomics.xyz/uploads/images/series/${id}/${item.image}`;
        }

        all_series.push({
            title:          decode_html_entities(title),
            slug:           `https://flamecomics.xyz/series/${id}`,
            cover:          cover_url,
            sources:        { 'Flame Comics': `https://flamecomics.xyz/series/${id}` },
            flame_series_id: id,
            max_chapter:    item.chapter_count ? parseFloat(item.chapter_count) : null,
            chapters:       { 'Flame Comics': chapters },
        });

        // Rate limit: 500ms between requests to stay at ~2 req/s.
        await sleep(500);
    }

    console.log(`[Flame] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_flame };
