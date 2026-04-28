const { scrape_wp_site } = require('../../lib/wp-theme');
const { normalise_title } = require('../../lib/helpers');

function adk_slug_from_href(href)
{
	const from_manga = href.match(/\/manga\/([^\/]+)\/?/)?.[1];
	if (from_manga) return from_manga.toLowerCase();
	return href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '').toLowerCase() || href.toLowerCase();
}

async function scrape_adk(opts = {})
{
	const state       = opts.state       ?? null;
	const run         = opts.run         ?? 0;
	const status_only = opts.status_only ?? false;
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
			run,
			status_only,
			status_override: status_filter.charAt(0).toUpperCase() + status_filter.slice(1),
		});
		all_results.push(...results);
	}
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
