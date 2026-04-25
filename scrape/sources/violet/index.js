/**
 * scrape/sources/violet/index.js -- Violet Scans scraper
 *
 * Violet Scans (https://violetscans.org) uses the same WordPress manga theme
 * as Thunder Scans. Configuration only -- see scrape/lib/wp-theme.js for the
 * shared scraping engine.
 *
 * Listing URL pattern:
 *   https://violetscans.org/comics/?page={n}
 *
 * Slug format:
 *   Last path segment of the /comics/{slug}/ URL.
 *
 * Stored chapters:
 *   Only non-integer chapters (e.g. 0, 12.5).
 */

const { scrape_wp_site } = require('../../lib/wp-theme');

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Array of series objects for merge().
 */
async function scrape_violet(opts = {})
{
	return scrape_wp_site({
		name:        'Violet Scans',
		listing_url: 'https://violetscans.org/comics/?page=',
		state:       opts.state ?? null,
	});
}

module.exports = { scrape_violet };
