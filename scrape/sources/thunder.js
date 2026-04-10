const cheerio = require('cheerio');
const { fetch, decode_html_entities, add_cards } = require('./helpers');

function extract_thunder_cards(html)
{
    const $ = cheerio.load(html);
    const cards = [];
    const seen_slugs = new Set();

    const epxs_re = /class="epxs">([^<]+)<\/div>/g;
    const epxs_vals = [];
    let m;
    while ((m = epxs_re.exec(html)) !== null) epxs_vals.push(m[1].trim());

    let card_idx = 0;
    $('.listupd .bs .bsx').each(
		(i, el) => {
			const link = $(el).find('a').first();
			const href = link.attr('href');
			if (!href) return;

			const slug = href.match(/\/comics\/([^\/]+)\/?/)?.[1];
			if (!slug || seen_slugs.has(slug)) return;

			const title = $(el).find('.tt').text().trim() || slug.replace(/-/g, ' ');
			const cover = $(el).find('.limit img').attr('src');

            const max_chapter = parse_chapter_label(epxs_vals[card_idx] || '');
            const series_url = `https://en-thunderscans.com/comics/${slug}/`;

            seen_slugs.add(slug);
            cards.push({
                title: decode_html_entities(title),
                slug,
                cover,
                sources: { 'Thunder Scans': series_url },
                max_chapter,
            });
            card_idx++;
        }
    );

    return cards;
}

function parse_chapter_label(text)
{
    if (!text) return null;
    const m = text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
              || text.match(/(\d+(?:\.\d+)?)/);
    return m ? parseFloat(m[1]) : null;
}

async function scrape_thunder()
{
	console.log('[Thunder] Starting...');
	const all_series = [];
	const seen_slugs = new Set();

	let page = 1;
	let consecutive_no_new = 0;

	while (consecutive_no_new < 5)
	{
		const url = `https://en-thunderscans.com/comics/?page=${page}`;
		console.log(`[Thunder] Fetching page ${page}, total=${all_series.length}`);
		let res;
		
		try
		{
			res = await fetch(url);
		}
		catch (e)
		{
			console.error(`[Thunder] Fetch error: ${e.message}`);
			break;
		}

		if (res.status !== 200)
		{
			console.error(`[Thunder] HTTP ${res.status}, stopping.`);
			break;
		}

		const cards = extract_thunder_cards(res.body);
		const added = add_cards(cards, all_series, seen_slugs);
		console.log(`[Thunder] Page ${page}: ${cards.length} cards, ${added} new, total=${all_series.length}`);

		if (added === 0)
		{
			consecutive_no_new++;
			console.log(`[Thunder] No new series (${consecutive_no_new}/5 consecutive).`);
		}
		else
		{
			consecutive_no_new = 0;
		}

		page++;
	}

	console.log(`[Thunder] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_thunder };