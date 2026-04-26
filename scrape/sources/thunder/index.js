/**
 * scrape/sources/thunder/index.js -- Thunder Scans scraper
 *
 * Thunder Scans (https://en-thunderscans.com) uses the standard WordPress
 * manga theme (Madara fork). All the heavy lifting is done by the shared
 * wp-theme engine in scrape/lib/wp-theme.js -- this file only provides
 * the site-specific configuration.
 *
 * Listing URL pattern:
 *   https://en-thunderscans.com/comics/?page={n}
 *
 * Slug format:
 *   Extracted from the /comics/{slug}/ path segment.
 *   Some slugs have a leading numeric prefix (e.g. "0086250808-title") --
 *   the front-end strips this when constructing chapter URLs.
 *
 * Stored chapters:
 *   Only non-integer chapters (e.g. 12.5, 0) -- integer URLs are built
 *   on the front-end from the chapter number alone.
 */

const { scrape_wp_site } = require('../../lib/wp-theme');

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Array of series objects for merge().
 */
async function scrape_thunder(opts = {})
{
	return scrape_wp_site({
		name:        'Thunder Scans',
		listing_url: 'https://en-thunderscans.com/comics/?status=&type=&order=update&page=',
		state:       opts.state ?? null,
	});
}

module.exports = { scrape_thunder };
