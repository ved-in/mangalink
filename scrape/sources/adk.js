const cheerio = require('cheerio');
const { fetch, decode_html_entities } = require('./helpers');

async function scrape_adk()
{
    console.log('[ADK] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    let page = 1;
    let consecutive_empty = 0;

    //while (page <= 2 && consecutive_empty < 5) {
    while (consecutive_empty < 5)
    {
        const url = `https://www.silentquill.net/manga/?page=${page}`;

        console.log(`[ADK] Fetching page ${page}, total=${all_series.length}`);
        
        let res;
        try
        {
            res = await fetch(url);
        }
        catch (e) {
            console.error(`[ADK] Fetch error: ${e.message}`);
            continue;
        }

        if (res.status !== 200)
        {
            console.error(`[ADK] HTTP ${res.status}, stopping.`);
            break;
        }

        const $ = cheerio.load(res.body);
        const cards = [];

        // Look for manga cards inside .listupd .bs .bsx
        // Weird ahh html
        $('.listupd .bs .bsx').each(
            (i, elem) => 
            {
                const element = $(elem);
                const link = element.find('a:first');
                const href = link.attr('href');

                if (!href) return;

                let slug = href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '');
                if (seen_slugs.has(slug)) return;

                let title = 
                    element.find('.bigor .tt').text().trim()
                    || element.find('.tt').text().trim()
                    || slug.replace(/-/g, ' ');

                let cover = 
                    element.find('img').attr('data-src') 
                    || element.find('img').attr('src');

                if (cover && !cover.startsWith('http'))
                {
                    cover = 'https://www.silentquill.net' + cover;
                }

                seen_slugs.add(slug);
                cards.push({ title: decode_html_entities(title), slug: href, cover, sources: ['ADK Scans'] });
            }
        );

        all_series.push(...cards);

        if (cards.length === 0)
        {
            consecutive_empty++;
            console.log(`[ADK] Page ${page}: 0 cards, total=${all_series.length} (${consecutive_empty}/3 consecutive empty).`);
        }
        else
        {
            consecutive_empty = 0;
            console.log(`[ADK] Page ${page}: ${cards.length} cards, total=${all_series.length}`);
        }

        page++;
    }

    console.log(`[ADK] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_adk };