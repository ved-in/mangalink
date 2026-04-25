/**
 * scrape/sources/demonic/listing.js
 *
 * Parses Demonic Scans "last updates" listing pages.
 *
 * ── Page structure ────────────────────────────────────────────────────────────
 *
 * Each listing page is at:
 *   GET https://demonicscans.org/lastupdates.php?list={n}
 *
 * The page contains a set of ".updates-element" cards. Each card has:
 *   - An anchor with href="/manga/{slug}" (series page link)
 *   - A title= attribute on that anchor (full title, never truncated)
 *   - A thumbnail <img>
 *   - Several <a class="chplinks"> anchors whose hrefs contain
 *       ?manga={id}&chapter={num}
 *     From these we extract the numeric manga ID and highest chapter number.
 *
 * ── What gets extracted from each card ───────────────────────────────────────
 *
 *   slug        -- path segment from /manga/{slug}/
 *   title       -- from title= attribute (falls back to h2/.tt text, then slug)
 *   cover       -- src of first <img> in the card
 *   max_chapter -- highest chapter= value seen in the chapter links
 *   demonic_id  -- manga= value from any chapter link; used by front-end for URLs
 *   status      -- always null (Demonic listing does not expose status)
 */

const cheerio = require('cheerio');
const { decode_html_entities } = require('../../lib/helpers');

/**
 * Parse all series cards from one Demonic "last updates" page HTML.
 *
 * @param {string} html  Raw HTML of one lastupdates.php page.
 * @returns {Array}      Array of card objects.
 */
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
		const slug = href.replace('/manga/', '').replace(/\/$/, '');
		if (seen_slugs.has(slug)) return;

		// Title: prefer the anchor's title= attribute -- text content is often
		// truncated to fit the card width.
		const title =
			link.attr('title') ||
			$c.find('h2, .tt').first().text().trim() ||
			slug.replace(/-/g, ' ');

		const cover = $c.find('.thumb img, img').first().attr('src') || null;

		// Extract max_chapter and demonic_id from the chapter link hrefs.
		let max_chapter = null;
		let demonic_id  = null;

		$c.find('a.chplinks').each((_, a) =>
		{
			const chap_href = $(a).attr('href') || '';

			// demonic_id: grab from the first chapter link that has one.
			if (!demonic_id)
			{
				const id_match = chap_href.match(/[?&]manga=(\d+)/);
				if (id_match) demonic_id = id_match[1];
			}

			// max_chapter: track the highest chapter= value seen.
			const ch_match = chap_href.match(/[?&]chapter=(\d+(?:\.\d+)?)/);
			if (ch_match)
			{
				const n = parseFloat(ch_match[1]);
				if (max_chapter === null || n > max_chapter) max_chapter = n;
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
