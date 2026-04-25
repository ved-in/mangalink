/**
 * scrape/lib/helpers.js
 *
 * Shared low-level utilities used by every scraper.
 * Nothing in here is site-specific.
 */

// ── HTTP ──────────────────────────────────────────────────────────────────────

// Headers sent with every request.
// A browser-like User-Agent is required -- Cloudflare-protected sites (Demonic,
// Thunder, Violet, ADK) reject requests that look like bots.
const DEFAULT_HEADERS =
{
	'User-Agent': 'Mozilla/5.0 (compatible; MangaLinkScraper/1.0)',
	'Accept':     'text/html,application/json,*/*',
};

/**
 * Thin wrapper around Node 18+ native fetch.
 *
 * Why wrap it?
 *   - Injects the default headers automatically so scrapers don't repeat them.
 * 	 - Retries failed attempts again after a delay.
 *   - Returns { status, body } instead of a raw Response so callers don't
 *     need to await res.text() themselves.
 *
 * @param {string} url
 * @param {object} [opts]  Any extra options merged over the defaults.
 * @returns {Promise<{ status: number, body: string }>}
 */
async function http_get(url, opts = {})
{
	const MAX_RETRIES = 5;
	const RETRY_DELAY = 1000; // doubles each attempt: 1s, 2s, 4s

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++)
	{
		try
		{
			const res  = await globalThis.fetch(url,
			{
				...opts,
				headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) },
			});
			const body = await res.text();
			return { status: res.status, body };
		}
		catch (e)
		{
			if (attempt === MAX_RETRIES) throw e;
			const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
			console.warn(`[http_get] Attempt ${attempt} failed for ${url}: ${e.message} -- retrying in ${delay}ms`);
			await sleep(delay);
		}
	}
}

// ── Timing ────────────────────────────────────────────────────────────────────

/**
 * Pause for `ms` milliseconds.
 * Used between requests to stay within a site's rate limit.
 */
function sleep(ms)
{
	return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Text ──────────────────────────────────────────────────────────────────────

/**
 * Convert HTML entities in scraped text back to real characters.
 * Covers the entities most commonly found in manga site titles.
 *
 * Examples:
 *   "&amp;"   -> "&"
 *   "&#8217;" -> "'" (right single quote)
 *   "&#038;"  -> "&"
 */
function decode_html_entities(str)
{
	return str
		.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
		.replace(/&amp;/g,   '&')
		.replace(/&lt;/g,    '<')
		.replace(/&gt;/g,    '>')
		.replace(/&quot;/g,  '"')
		.replace(/&#8217;/g, '\u2019')
		.replace(/&#038;/g,  '&')
		.trim();
}

/**
 * Normalise a manga title to a stable deduplication key.
 * Mirrors the same function in scrape.js and js/api.js so that
 * state lookups always hit the correct key.
 *
 * Steps: lowercase → strip accents → drop punctuation → collapse spaces.
 *
 * Example: "Oshi no Ko!" -> "oshi no ko"
 */
function normalise_title(title)
{
	return title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

// ── Status ────────────────────────────────────────────────────────────────────

/**
 * Priority order used when two sources report different statuses.
 * Higher number wins.
 *
 *   Dropped (3) > Hiatus (2) > Ongoing (1) > Completed (0) > unknown (-1)
 *
 * Rationale: "Dropped" is the strongest signal and should always surface.
 * "Hiatus" beats "Ongoing" because a series on break on one mirror may still
 * serve cached chapters on another, making it look active.
 */
const STATUS_PRIORITY = { Dropped: 3, Hiatus: 2, Ongoing: 1, Completed: 0 };

/**
 * Map a raw status string from a scraper to a canonical value.
 * Returns null when the string cannot be mapped (e.g. empty or unrecognised).
 */
function normalise_status(raw)
{
	if (!raw) return null;
	const l = raw.toLowerCase();
	if (l.includes('dropped')   || l.includes('cancelled') || l.includes('canceled')) return 'Dropped';
	if (l.includes('hiatus'))                                                          return 'Hiatus';
	if (l.includes('ongoing'))                                                         return 'Ongoing';
	if (l.includes('completed') || l.includes('complete'))                             return 'Completed';
	return null;
}

/**
 * Return whichever of two status strings has the higher priority.
 * Either argument may be null -- the other wins automatically.
 */
function merge_status(a, b)
{
	const pa = STATUS_PRIORITY[a] ?? -1;
	const pb = STATUS_PRIORITY[b] ?? -1;
	return pb > pa ? b : a;
}

// ── Pagination helpers ────────────────────────────────────────────────────────

/**
 * Push cards into `all_series`, skipping any whose slug is already in `seen_slugs`.
 * Returns the count of newly added items.
 *
 * Used by HTML scrapers that paginate through a listing and may encounter the
 * same series on multiple pages.
 */
function add_cards(cards, all_series, seen_slugs)
{
	let added = 0;
	for (const card of cards)
	{
		if (!seen_slugs.has(card.slug))
		{
			seen_slugs.add(card.slug);
			all_series.push(card);
			added++;
		}
	}
	return added;
}

// ── Chapter helpers ───────────────────────────────────────────────────────────

/**
 * Returns true for chapter numbers that are NOT positive integers.
 * This includes decimals (12.5) and chapter 0 (prologue).
 *
 * Why we care: integer chapter URLs can be reconstructed on the front-end
 * from just the number, but non-integer URLs need their explicit slug stored.
 */
function is_non_integer_chapter(num)
{
	const n = parseFloat(num);
	return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

/**
 * Parse a human-readable chapter label into a float.
 * Handles formats like "Chapter 46.2", "Ch. 12", "Episode 3", "47".
 * Returns null when no number can be extracted.
 */
function parse_chapter_label(text)
{
	if (!text) return null;
	const m = text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
	       || text.match(/(\d+(?:\.\d+)?)/);
	return m ? parseFloat(m[1]) : null;
}

module.exports =
{
	http_get,
	sleep,
	decode_html_entities,
	normalise_title,
	normalise_status,
	merge_status,
	add_cards,
	is_non_integer_chapter,
	parse_chapter_label,
};
