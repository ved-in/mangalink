const cheerio = require('cheerio');
const { fetch, decode_html_entities, add_cards } = require('./helpers');

function extract_violet_cards(html)
{
    const cards = [];
    const seen_slugs = new Set();
    const $ = cheerio.load(html);

    // .epxs is commented out in the HTML, so cheerio can't see it.
    // Grab chapter labels from the raw HTML string instead.
    const epxs_re = /class="epxs">([^<]+)<\/div>/g;
    const epxs_vals = [];
    let em;
    while ((em = epxs_re.exec(html)) !== null) epxs_vals.push(em[1].trim());

    let card_idx = 0;
    $('.listupd .bs .bsx').each((_, el) =>
    {
        const element = $(el);
        const link = element.find('a').first();
        const href = link.attr('href');
        if (!href || !href.includes('/comics/')) return;

        const url = href.endsWith('/') ? href : href + '/';
        const slug = url.replace(/\/$/, '').split('/').pop();
        if (!slug || seen_slugs.has(slug)) return;

        const title =
            link.attr('title') ||
            element.find('.tt').text().trim() ||
            slug.replace(/-/g, ' ');

        const cover =
            element.find('.limit img').attr('src') ||
            element.find('img').first().attr('src') ||
            null;

        let max_chapter = null;
        const epxs_text = epxs_vals[card_idx] || '';
        if (epxs_text)
        {
            const m = epxs_text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
                   || epxs_text.match(/(\d+(?:\.\d+)?)/);
            if (m) max_chapter = parseFloat(m[1]);
        }

        seen_slugs.add(slug);
        cards.push({
            title: decode_html_entities(title),
            slug,
            cover,
            sources: { 'Violet Scans': url },
            max_chapter,
        });
        card_idx++;
    });

    return cards;
}

async function scrape_violet()
{
    console.log('[Violet] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    let page = 1;
    let consecutive_no_new = 0;

    while (consecutive_no_new < 5)
    {
        const url = `https://violetscans.org/comics/?page=${page}`;
        console.log(`[Violet] Fetching page ${page}, total=${all_series.length}`);

        let res;
        try
        {
            res = await fetch(url);
        }
        catch (e)
        {
            console.error(`[Violet] Fetch error: ${e.message}`);
            break;
        }

        if (res.status !== 200)
        {
            console.error(`[Violet] HTTP ${res.status}, stopping.`);
            break;
        }

        const cards = extract_violet_cards(res.body);
        const added = add_cards(cards, all_series, seen_slugs);
        console.log(`[Violet] Page ${page}: ${cards.length} cards, ${added} new, total=${all_series.length}`);

        if (added === 0)
        {
            consecutive_no_new++;
            console.log(`[Violet] No new series (${consecutive_no_new}/5 consecutive).`);
        }
        else
        {
            consecutive_no_new = 0;
        }

        page++;
    }

    console.log(`[Violet] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_violet };
