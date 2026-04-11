const { fetch, decode_html_entities, add_cards } = require('./helpers');
const cheerio = require('cheerio');

function is_non_integer(num)
{
    const n = parseFloat(num);
    return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

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
            let manga_id = null;
            $(container).find('a.chplinks').each((_, a) =>
            {
                const chap_href = $(a).attr('href') || '';

                if (!manga_id)
                {
                    const id_match = chap_href.match(/[?&]manga=(\d+)/);
                    if (id_match) manga_id = id_match[1];
                }

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
					sources: { 'Demonic Scans': `https://demonicscans.org/manga/${slug}` },
                    max_chapter,
                    demonic_id: manga_id,
                    chapters: { 'Demonic Scans': [] },
                    _series_url: `https://demonicscans.org/manga/${slug}`,
				}
			);
        });

    return cards;
}

async function fetch_series_chapters(series_url)
{
    try
    {
        const res = await fetch(series_url);
        if (res.status !== 200) return [];

        const $ = cheerio.load(res.body);
        const chapters = [];
        const seen = new Set();

        $('a.chplinks').each((_, a) => {
            const href = $(a).attr('href') || '';
            const ch_match = href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
            if (!ch_match) return;
            const num = parseFloat(ch_match[1]);
            if (seen.has(num)) return;
            seen.add(num);
            chapters.push({ number: num });
        });

        return chapters;
    }
    catch (e)
    {
        console.error(`[Demonic] Failed chapters for ${series_url}: ${e.message}`);
        return [];
    }
}

async function scrape_demonic()
{
    console.log('[Demonic] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    const BATCH = 30;
    let list_num = 1;
    let stop = false;

    while (!stop)
	{
        const batch_nums = Array.from({ length: BATCH }, (_, i) => list_num + i);
        const results = await Promise.all(
            batch_nums.map(
                async (n) => {
                    const url = `https://demonicscans.org/lastupdates.php?list=${n}`;
                    try {
                        const res = await fetch(url);
                        if (res.status !== 200) return { n, cards: [] };
                        return { n, cards: extract_demonic_cards(res.body) };
                    } catch (e) {
                        console.error(`[Demonic] Fetch error list=${n}: ${e.message}`);
                        return { n, cards: [] };
                    }
                }
            )
        );

        let empty_count = 0;
        for (const { n, cards } of results)
        {
            const added = add_cards(cards, all_series, seen_slugs);
            console.log(`[Demonic] list=${n}: ${cards.length} cards, ${added} new, total=${all_series.length}`);
            if (cards.length === 0) empty_count++;
        }

        if (empty_count >= 5) stop = true;
        list_num += BATCH;
    }
    
    const CONCURRENCY = 200;
    console.log(`[Demonic] Fetching chapter data for ${all_series.length} series (concurrency=${CONCURRENCY})...`);

    for (let i = 0; i < all_series.length; i += CONCURRENCY)
    {
        const batch = all_series.slice(i, i + CONCURRENCY);
        await Promise.all(
            batch.map(
                async (s) => {
                    const all_chapters = await fetch_series_chapters(s._series_url);
                    const filtered = all_chapters.filter(ch => is_non_integer(ch.number));
                    if (filtered.length)
                    {
                        s.chapters['Demonic Scans'] = filtered.map(
                            ch => (
                                {
                                    name: String(ch.number),
                                    chapter_number: ch.number,
                                }
                            )
                        );
                    }
                    delete s._series_url;
                }
            )
        );
        console.log(`[Demonic] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
    }

    console.log(`[Demonic] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_demonic };