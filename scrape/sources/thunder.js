const cheerio = require('cheerio');
const { fetch, decode_html_entities, add_cards } = require('./helpers');

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

        const cheerio = require('cheerio');
        const $ = cheerio.load(res.body);
        const chapters = [];

        $('#chapterlist ul li').each((_, elem) => {
            const num  = $(elem).attr('data-num');
            const href = $(elem).find('a[href]').first().attr('href');
            if (!num || !href) return;
            const ch_slug = href.replace(/\/$/, '').split('/').pop();
            chapters.push({ number: parseFloat(num), chapter_slug: ch_slug });
        });

        return chapters;
    }
    catch (e)
    {
        console.error(`[Thunder] Failed chapters for ${series_url}: ${e.message}`);
        return [];
    }
}

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
				chapters: { 'Thunder Scans': [] },
				_series_url: series_url,
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

	const CONCURRENCY = 5;
	console.log(`[Thunder] Fetching non-integer chapters for ${all_series.length} series (concurrency=${CONCURRENCY})...`);

	for (let i = 0; i < all_series.length; i += CONCURRENCY)
	{
		const batch = all_series.slice(i, i + CONCURRENCY);
		await Promise.all(
			batch.map(
				async (s) => {
					const all_chapters = await fetch_series_chapters(s._series_url);
					const filtered = all_chapters.filter(ch => is_non_integer(ch.number));
					if (filtered.length) {
						s.chapters['Thunder Scans'] = filtered.map(ch => ({
							name: String(ch.number),
							chapter_slug: ch.chapter_slug,
						}));
					}
					delete s._series_url;
				}
			)
		);
		console.log(`[Thunder] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
	}

	console.log(`[Thunder] Done. Found ${all_series.length} series.`);
	return all_series;
}

module.exports = { scrape_thunder };