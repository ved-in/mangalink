const { fetch, decode_html_entities, add_cards } = require('./helpers');
const cheerio = require('cheerio');

function extract_demonic_cards(html)
{
    const cards = [];
    const seen_slugs = new Set();
    const $ = cheerio.load(html);
    
    $('.updates-element').each(
		(_, container) => {
			const link = $(container).find('a[href^="/manga/"]').first();
			if (!link.length) return;
			
			const href = link.attr('href');
			const slug = href.replace('/manga/', '').replace(/\/$/, '');
			if (seen_slugs.has(slug)) return;

			// Try to get title from title attribute first (full title)
			let title = link.attr('title');
			// If no title attribute, fall back to text content (truncated. many a times contains ...)
			if (!title)
			{
				title = $(container).find('h2, .tt').first().text().trim();
			}
			// If still no title, use slug as fallback (its probably useless but meh)
			if (!title) title = slug.replace(/-/g, ' ');
			
			let cover = $(container).find('.thumb img, img').first().attr('src');

            // Chapter links are right in the listing: href="chaptered.php?manga=X&chapter=89"
            // Grab all chapter numbers from this card and take the max
            let max_chapter = null;
            $(container).find('a.chplinks').each((_, a) =>
            {
                const chap_href = $(a).attr('href') || '';
                const m = chap_href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
                if (m)
                {
                    const n = parseFloat(m[1]);
                    if (max_chapter === null || n > max_chapter) max_chapter = n;
                }
            });

			
			seen_slugs.add(slug);
			cards.push(
				{ 
					title: decode_html_entities(title), 
					slug: slug, 
					cover: cover, 
					sources: ['Demonic Scans'],
                    max_chapter,
				}
			);
        });

    return cards;
}

async function scrape_demonic()
{
    console.log('[Demonic] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    let list_num = 1;
    let consecutive_empty = 0;

    while (consecutive_empty < 5)
	{
        const url = `https://demonicscans.org/lastupdates.php?list=${list_num}`;
        console.log(`[Demonic] Fetching list=${list_num}, total=${all_series.length}`);

        let res;
        try
		{
            res = await fetch(url);
        }
		catch (e)
		{
            console.error(`[Demonic] Fetch error: ${e.message}`);
            break;
        }

        if (res.status !== 200)
		{
            console.error(`[Demonic] HTTP ${res.status}, stopping.`);
            break;
        }

        const cards = extract_demonic_cards(res.body);
        const added = add_cards(cards, all_series, seen_slugs);

        if (cards.length === 0)
		{
            consecutive_empty++;
            console.log(`[Demonic] list=${list_num}: 0 cards, total=${all_series.length} (${consecutive_empty}/5 consecutive empty).`);
        }
		else
		{
            consecutive_empty = 0;
            console.log(`[Demonic] list=${list_num}: ${cards.length} cards, ${added} new, total=${all_series.length}`);
        }

        list_num++;
    }

    console.log(`[Demonic] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_demonic };