const DEFAULT_HEADERS =
{
	'User-Agent': 'Mozilla/5.0 (compatible; MangaLinkScraper/1.0)',
	'Accept':     'text/html,application/json,*/*',
};

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

function sleep(ms)
{
	return new Promise(resolve => setTimeout(resolve, ms));
}

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

function normalise_title(title)
{
	return title
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^\w\s]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

const STATUS_PRIORITY = { Ongoing: 3, Hiatus: 2, Dropped: 1, Completed: 0 };

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

function merge_status(a, b)
{
	const pa = STATUS_PRIORITY[a] ?? -1;
	const pb = STATUS_PRIORITY[b] ?? -1;
	return pb > pa ? b : a;
}

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

function is_non_integer_chapter(num)
{
	const n = parseFloat(num);
	return !isNaN(n) && (n % 1 !== 0 || n === 0);
}

function parse_chapter_label(text)
{
	if (!text) return null;
	const m = text.match(/(?:chapter|ch|episode|ep)[.\-\s#]*(\d+(?:\.\d+)?)/i)
	       || text.match(/(\d+(?:\.\d+)?)/);
	return m ? parseFloat(m[1]) : null;
}

function parse_relative_time(text)
{
	if (!text) return null;
	const s = text.toLowerCase().trim();

	if (s === 'just now' || s === 'moments ago' || s === 'a moment ago')
		return new Date().toISOString();

	const m = s.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
	if (!m) return null;

	const n    = parseInt(m[1], 10);
	const unit = m[2];
	const MS   = { second: 1e3, minute: 60e3, hour: 3600e3, day: 86400e3,
	               week: 604800e3, month: 2592000e3, year: 31536000e3 };

	return new Date(Date.now() - n * MS[unit]).toISOString();
}

module.exports =
{
	http_get,
	http_get_with_retry: http_get,
	sleep,
	decode_html_entities,
	normalise_title,
	normalise_status,
	merge_status,
	add_cards,
	is_non_integer_chapter,
	parse_chapter_label,
	parse_relative_time,
};