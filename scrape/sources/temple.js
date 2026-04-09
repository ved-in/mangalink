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

        const slug_pattern = /\\"series_slug\\":\\"([a-z0-9\-]+)\\"/g;

        let slug_matches = [];
        let match;
        while ((match = slug_pattern.exec(html)) !== null)
        {
            slug_matches.push(match[1]);
        }

        console.log(`[Temple] Found ${slug_matches.length} slugs`);
        
        if (slug_matches.length > 0)
        {
            console.log(`[Temple] First 5 slugs: ${slug_matches.slice(0, 5).join('  ____  ')}`);
        }
        
        const title_pattern = /\\"title\\":\\"([^\\]+)\\"/g;
        let title_matches = [];
        while ((match = title_pattern.exec(html)) !== null)
        {
            title_matches.push(match[1]);
        }
        console.log(`[Temple] Found ${title_matches.length} titles`);
        
        const thumb_pattern = /\\"thumbnail\\":\\"(https:[^\\]+)\\"/g;
        let thumb_matches = [];
        while ((match = thumb_pattern.exec(html)) !== null)
        {
            thumb_matches.push(match[1]);
        }
        console.log(`[Temple] Found ${thumb_matches.length} thumbnails`);

        if (slug_matches.length !== title_matches.length || slug_matches.length !== thumb_matches.length)
        {
            console.error(`[Temple] Length mismatch\n\tslugs: ${slug_matches.length},\n\ttitles: ${title_matches.length},\n\tthumbs: ${thumb_matches.length}`);
            console.error('[Temple] Aborting extraction to prevent data corruption');
            return [];
        }
        
        const count = slug_matches.length;
        for (let i = 0; i < count; i++)
        {
            const slug = slug_matches[i];
            const title = title_matches[i];
            const cover = thumb_matches[i];
            
            if (!slug || seen_slugs.has(slug)) continue;
            if (!title || title.length <= 1) continue;
            
            seen_slugs.add(slug);
            all_series.push(
                {
                    title: decode_html_entities(title), 
                    slug: `https://templetoons.com/comic/${slug}`, 
                    cover, 
                    sources: ['Temple Toons'] 
                }
            );
        }
        
        console.log(`[Temple] Successfully extracted ${all_series.length} series`);
        
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