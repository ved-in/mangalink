const { scrape_wp_site } = require('../../lib/wp-theme');

async function scrape_thunder(opts = {})
{
	return scrape_wp_site({
		name:               'Thunder Scans',
		listing_url:        'https://en-thunderscans.com/comics/?page=',
		listing_url_suffix: '&status=&type=&order=update',
		state:              opts.state       ?? null,
		run:                opts.run         ?? 0,
		status_only:        opts.status_only ?? false,
	});
}

module.exports = { scrape_thunder };
