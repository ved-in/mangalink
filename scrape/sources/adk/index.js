/**
 * scrape/sources/adk/index.js -- ADK Scans scraper  (silentquill.net)
 *
 * ADK Scans (https://www.silentquill.net) is a fork of the same WordPress
 * manga theme as Thunder and Violet, with two differences:
 *
 *   1. Listing path is /manga/ instead of /comics/.
 *   2. The .epxs chapter label IS visible to cheerio (not commented out),
 *      but the shared engine extracts it from raw HTML anyway, so it works
 *      correctly for both cases.
 *   3. The slug in state is keyed by the full series href (the site uses
 *      full URLs as its canonical identifier in some places).
 *
 * All scraping logic lives in scrape/lib/wp-theme.js. This file provides
 * the ADK-specific config, including a custom slug_from_href that extracts
 * the path segment after /manga/ instead of /comics/.
 *
 * Listing URL pattern:
 *   https://www.silentquill.net/manga/?page={n}
 */

const { scrape_wp_site } = require('../../lib/wp-theme');

/**
 * Extract the dedup slug from an ADK series href.
 * ADK uses /manga/{slug}/ instead of the /comics/{slug}/ pattern used by
 * Thunder and Violet, so we need a custom extractor.
 *
 * Returns the path segment after /manga/, or falls back to the full href
 * if the pattern doesn't match (shouldn't happen in practice).
 *
 * @param {string} href  e.g. "https://www.silentquill.net/manga/some-title/"
 * @returns {string}     e.g. "some-title"
 */
function adk_slug_from_href(href)
{
	return href.match(/\/manga\/([^\/]+)\/?/)?.[1] ?? href;
}

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Array of series objects for merge().
 */
async function scrape_adk(opts = {})
{
	return scrape_wp_site({
		name:           'ADK Scans',
		listing_url:    'https://www.silentquill.net/manga/?page=',
		slug_from_href: adk_slug_from_href,
		state:          opts.state ?? null,
	});
}

module.exports = { scrape_adk };
