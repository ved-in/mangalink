/*
 * scrape/sources/helpers.js
 *
 * Shared utilities for all scraper source modules.
 *
 * FETCH:
 *   A thin wrapper around the native Node.js fetch (available since Node 18).
 *   Injects a browser-like User-Agent and Accept headers so scranlation sites
 *   behind Cloudflare do not block the request.
 *   Native fetch handles gzip/br/zstd decompression transparently per the
 *   WHATWG Fetch spec, so no manual zlib calls are needed.
 *   Redirects are followed automatically by native fetch (redirect: 'follow').
 *
 * SLEEP:
 *   Simple Promise-based delay. Used by scrapers to rate-limit their requests
 *   and avoid getting IP-banned by source sites.
 *
 * DECODE_HTML_ENTITIES:
 *   Converts common HTML entities in scraped text back to real characters.
 *   e.g. "&amp;" -> "&", "&#8217;" -> right single quote
 *
 * ADD_CARDS:
 *   Deduplication helper. Pushes new series cards into the accumulator array
 *   only if their slug has not been seen before.
 *
 * NORMALISE_STATUS / MERGE_STATUS:
 *   Canonicalises raw status strings from scrapers into one of four values:
 *   "Ongoing", "Completed", "Hiatus", or "Dropped".
 *   merge_status() picks the highest-priority status when multiple sources
 *   disagree.  Priority: Dropped > Hiatus > Ongoing > Completed > null.
 *   Rationale: if any one source marks a series Dropped, that signal should
 *   win because update schedules rarely reflect on every mirror simultaneously.
 */

// Default headers sent with every scraper request.
// The User-Agent is required -- Cloudflare-protected sites (Demonic, Thunder,
// Violet, ADK) reject requests that lack a browser-like UA string.
const DEFAULT_HEADERS =
{
	'User-Agent':      'Mozilla/5.0 (compatible; MangaLinkScraper/1.0)',
	'Accept':          'text/html,application/json,*/*',
};

// Thin wrapper around native fetch that injects default headers.
// Native fetch (Node 18+ / undici) auto-decompresses gzip/br/zstd and
// follows redirects, so we don't need to handle either manually.
// Extra options (e.g. custom headers for a specific request) are merged
// over the defaults via the spread so callers can override if needed.
async function fetch(url, opts = {})
{
	const merged_headers = { ...DEFAULT_HEADERS, ...(opts.headers || {}) };
	const res = await globalThis.fetch(url,
	{
		...opts,
		headers: merged_headers,
	});
	// Return a lightweight object with the same shape the scrapers expect:
	//   { status: <number>, body: <string> }
	// Reading .text() here is safe because all scraper call sites immediately
	// parse the body (JSON.parse or cheerio.load) after checking res.status.
	const body = await res.text();
	return { status: res.status, body };
}

// Pause execution for a given number of milliseconds.
// Used to rate-limit scraper requests so source sites do not block the IP.
function sleep(ms)
{
	return new Promise(r => setTimeout(r, ms));
}

// Convert HTML character references and named entities to their Unicode equivalents.
// Covers the entities most commonly found in manga site titles and descriptions.
function decode_html_entities(str)
{
	return str
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
		.replace(/&amp;/g,   '&')
		.replace(/&lt;/g,    '<')
		.replace(/&gt;/g,    '>')
		.replace(/&quot;/g,  '"')
		.replace(/&#8217;/g, '\u2019')  // right single quotation mark
		.replace(/&#038;/g,  '&')
		.trim();
}

// Push series cards into all_series, skipping any whose slug is already in seen_slugs.
// Returns the number of newly added items.
// Used by scrapers that paginate through a listing to avoid duplicate entries.
function add_cards(cards, all_series, seen_slugs)
{
	let added = 0;
	for (const c of cards)
	{
		if (!seen_slugs.has(c.slug))
		{
			seen_slugs.add(c.slug);
			all_series.push(c);
			added++;
		}
	}
	return added;
}

// Numeric priority for status merging.
// Higher number wins when two sources disagree.
//   Dropped (3) > Hiatus (2) > Ongoing (1) > Completed (0) > null (-1)
// Rationale: Dropped is the most severe signal and should always surface.
// Hiatus beats Ongoing because a series on break on one site may still serve
// cached chapters on another. Ongoing beats Completed for the same reason.
const STATUS_PRIORITY =
{
	'Dropped':   3,
	'Hiatus':    2,
	'Ongoing':   1,
	'Completed': 0,
};

// Map any raw status string returned by a scraper to a canonical value.
// Returns null when the string cannot be mapped.
function normalise_status(raw)
{
	if (!raw) return null;
	const l = raw.toLowerCase();
	if (l.includes('dropped')   || l.includes('cancelled') || l.includes('canceled')) 	return 'Dropped';
	if (l.includes('hiatus'))                                                           return 'Hiatus';
	if (l.includes('ongoing'))                                                          return 'Ongoing';
	if (l.includes('completed') || l.includes('complete'))                             	return 'Completed';
	return null;
}

// Choose the higher-priority status between two candidates.
// Either argument may be null, in which case the other wins automatically.
// When both are equal the first value is returned unchanged.
function merge_status(existing, incoming)
{
	const ep = STATUS_PRIORITY[existing] ?? -1;
	const ip = STATUS_PRIORITY[incoming] ?? -1;
	return ip > ep ? incoming : existing;
}

module.exports =
{
	fetch,
	sleep,
	decode_html_entities,
	add_cards,
	normalise_status,
	merge_status,
};
