const cheerio = require('cheerio');
const { decode_html_entities } = require('../../lib/helpers');

function extract_demonic_cards(html)
{
	const $          = cheerio.load(html);
	const cards      = [];
	const seen_slugs = new Set();

	$('.updates-element').each((_, container) =>
	{
		const $c  = $(container);
		const link = $c.find('a[href^="/manga/"]').first();
		if (!link.length) return;

		const href = link.attr('href');
		const slug = href.replace('/manga/', '').replace(/\/$/, '').toLowerCase();
		if (seen_slugs.has(slug)) return;
		const title =
			link.attr('title') ||
			$c.find('h2, .tt').first().text().trim() ||
			slug.replace(/-/g, ' ');

		const cover = $c.find('.thumb img, img').first().attr('src') || null;
		let max_chapter = null;
		let demonic_id  = null;

		$c.find('a.chplinks').each((_, a) =>
		{
			const chap_href = $(a).attr('href') || '';
			if (!demonic_id)
			{
				const id_match = chap_href.match(/[?&]manga=(\d+)/);
				if (id_match) demonic_id = id_match[1];
			}
			const ch_match = chap_href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
			if (ch_match)
			{
				const n = parseFloat(ch_match[1]);
				if ((max_chapter === null || n > max_chapter) && n < 100_000) max_chapter = n;
			}
		});

		seen_slugs.add(slug);
		cards.push({
			title:       decode_html_entities(title),
			slug,
			cover,
			status:      null,   // not available on the listing page
			sources:     { 'Demonic Scans': `https://demonicscans.org/manga/${slug}` },
			max_chapter,
			demonic_id,
			chapters:    { 'Demonic Scans': [] },
			_series_url: `https://demonicscans.org/manga/${slug}`,
		});
	});

	return cards;
}

module.exports = { extract_demonic_cards };
