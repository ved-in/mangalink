const cheerio = require('cheerio');
const { fetch, decode_html_entities } = require('./helpers');

function is_non_integer(num)
{
    const n = parseFloat(num);
    return !isNaN(n) && n % 1 !== 0;
}

async function fetch_series_chapters(series_url)
{
    try
    {
        const res = await fetch(series_url);
        if (res.status !== 200) return [];

        const $ = cheerio.load(res.body);
        const chapters = [];

        $('#chapterlist ul li').each((i, elem) => {
            const num = $(elem).attr('data-num');
            const a   = $(elem).find('a[href]').first();
            const href = a.attr('href');
            if (!num || !href) return;
            chapters.push({ number: parseFloat(num), chapter_slug: href });
        });

        return chapters;
    }
    catch (e)
    {
        console.error(`[ADK] Failed chapters for ${series_url}: ${e.message}`);
        return [];
    }
}

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
            consecutive_empty++;
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

                // .epxs holds the latest chapter label, e.g. "Chapter 11.5 End"
                const epxs_text = element.find('.epxs').text().trim();
                const max_chapter = parse_chapter_label(epxs_text);

                seen_slugs.add(slug);
                cards.push({
                    title: decode_html_entities(title),
                    slug: href,
                    cover,
                    sources: { 'ADK Scans': href },
                    max_chapter,
                    chapters: { 'ADK Scans': [] },
                    _series_url: href,
                });
            }
        );

        all_series.push(...cards);

        if (cards.length === 0)
        {
            consecutive_empty++;
            console.log(`[ADK] Page ${page}: 0 cards (${consecutive_empty}/5 consecutive empty).`);
        }
        else
        {
            consecutive_empty = 0;
            console.log(`[ADK] Page ${page}: ${cards.length} cards, total=${all_series.length}`);
        }

        page++;
    }

    const CONCURRENCY = 5;
    console.log(`[ADK] Fetching non-integer chapters for ${all_series.length} series (concurrency=${CONCURRENCY})...`);

    for (let i = 0; i < all_series.length; i += CONCURRENCY)
    {
        const batch = all_series.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(
            async (s) => {
                const all_chapters = await fetch_series_chapters(s._series_url);
                const filtered = all_chapters.filter(ch => is_non_integer(ch.number));
                if (filtered.length) {
                    s.chapters['ADK Scans'] = filtered.map(ch => ({
                        name: String(ch.number),
                        chapter_slug: ch.chapter_slug,
                    }));
                }
                delete s._series_url;
            }
        ));
        console.log(`[ADK] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
    }

    console.log(`[ADK] Done. Found ${all_series.length} series.`);
    return all_series;
}

function parse_chapter_label(text)
{
    if (!text) return null;
    const m = text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
              || text.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
}

module.exports = { scrape_adk };