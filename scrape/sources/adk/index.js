/**
 * scrape/sources/adk/index.js -- ADK Scans scraper  (silentquill.net)
 *
 * ADK Scans (https://www.silentquill.net) is a fork of the same WordPress
 * manga theme as Thunder and Violet, with two differences:
 *
 *   1. Listing path is /manga/ instead of /comics/.
 *   2. Status must be fetched from three separate filtered listing URLs
 *      (?status=ongoing, ?status=completed, ?status=hiatus) because the
 *      default listing (?status=) does not reliably expose status per card.
 *      We scrape all three and merge, so every series gets its correct status.
 *
 * All scraping logic lives in scrape/lib/wp-theme.js. This file calls
 * scrape_wp_site() once per status filter and deduplicates the results.
 *
 * Listing URL pattern:
 *   https://www.silentquill.net/manga/?status={s}&type&order=latest&page={n}
 */

const { scrape_wp_site } = require('../../lib/wp-theme');
const { normalise_title } = require('../../lib/helpers');

/**
 * Extract the dedup slug from an ADK series href.
 * ADK uses /manga/{slug}/ instead of the /comics/{slug}/ pattern.
 */
function adk_slug_from_href(href)
{
	// ADK listing pages link to /manga/{slug}/ on the listing cards,
	// but the resolved series URL is https://www.silentquill.net/{slug}/.
	// Handle both: prefer /manga/{slug}/ extraction, fall back to stripping the origin.
	const from_manga = href.match(/\/manga\/([^\/]+)\/?/)?.[1];
	if (from_manga) return from_manga.toLowerCase();
	// Strip protocol+host to get the bare slug path.
	return href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '').toLowerCase() || href.toLowerCase();
}

/**
 * @param {object} opts
 * @param {object|null} opts.state  scrape_state from previous run, or null.
 * @returns {Promise<Array>}        Array of series objects for merge().
 */
async function scrape_adk(opts = {})
{
	const state = opts.state ?? null;

	// Fetch each status filter separately so every series gets a known status.
	// The default (no filter) listing doesn't expose status reliably per card.
	const STATUS_FILTERS = ['ongoing', 'completed', 'hiatus'];
	const all_results    = [];

	for (const status_filter of STATUS_FILTERS)
	{
		const listing_url = `https://www.silentquill.net/manga/?status=${status_filter}&order=latest&page=`;
		const results     = await scrape_wp_site({
			name:           `ADK Scans`,
			listing_url,
			slug_from_href: adk_slug_from_href,
			state,
			// Override status on every card with the filter value since the
			// listing page's status div may not render correctly for all forks.
			status_override: status_filter.charAt(0).toUpperCase() + status_filter.slice(1),
		});
		all_results.push(...results);
	}

	// Deduplicate by slug -- keep the first occurrence (ongoing list takes priority
	// for any series that appears in multiple filters due to listing quirks).
	const seen  = new Set();
	const dedup = [];
	for (const s of all_results)
	{
		if (!seen.has(s.slug))
		{
			seen.add(s.slug);
			dedup.push(s);
		}
	}

	console.log(`[ADK Scans] Total after dedup: ${dedup.length} series`);
	return dedup;
}

module.exports = { scrape_adk };
