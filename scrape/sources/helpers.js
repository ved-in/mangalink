/*
 * scrape/sources/helpers.js
 *
 * Shared utilities for all scraper source modules.
 *
 * FETCH:
 *   A custom HTTP client built on Node's built-in https/http modules.
 *   Used instead of the browser fetch() because this code runs in Node (GitHub Actions).
 *   Handles gzip/deflate decompression automatically.
 *   Follows redirects up to MAX_REDIRECTS hops, resolving relative Location headers
 *   correctly. Throws if the redirect chain is too long rather than looping forever.
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
 */

const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

// Maximum number of redirects to follow before giving up and throwing.
const MAX_REDIRECTS = 5;

// Internal: make a single HTTP/HTTPS request and return { status, body, headers }.
// Does NOT follow redirects -- that is handled by the outer fetch() loop.
// Handles gzip and deflate response encoding.
function _fetch_one(url, opts) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent':      'Mozilla/5.0 (compatible; MangaLinkScraper/1.0)',
        'Accept':          'text/html,application/json,*/*',
        'Accept-Encoding': 'gzip, deflate',
        ...opts.headers,
      },
      method: opts.method || 'GET',
    };

    const req = lib.request(url, options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer   = Buffer.concat(chunks);
        const encoding = res.headers['content-encoding'];

        if (encoding === 'gzip') {
          zlib.gunzip(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, body: decoded.toString(), headers: res.headers });
          });
        } else if (encoding === 'deflate') {
          zlib.inflate(buffer, (err, decoded) => {
            if (err) reject(err);
            else resolve({ status: res.statusCode, body: decoded.toString(), headers: res.headers });
          });
        } else {
          resolve({ status: res.statusCode, body: buffer.toString(), headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

// Public fetch: makes a request and follows up to MAX_REDIRECTS redirects.
// Relative Location headers are resolved against the current URL using the URL constructor.
// Throws an error if the redirect chain exceeds MAX_REDIRECTS.
async function fetch(url, opts = {}) {
  let current_url = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await _fetch_one(current_url, opts);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      // Resolve relative redirects (e.g. "/new-path") against the current URL.
      current_url = new URL(res.headers.location, current_url).href;
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`);
}

// Pause execution for a given number of milliseconds.
// Used to rate-limit scraper requests so source sites do not block the IP.
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Convert HTML character references and named entities to their Unicode equivalents.
// Covers the entities most commonly found in manga site titles and descriptions.
function decode_html_entities(str) {
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
function add_cards(cards, all_series, seen_slugs) {
  let added = 0;
  for (const c of cards) {
    if (!seen_slugs.has(c.slug)) {
      seen_slugs.add(c.slug);
      all_series.push(c);
      added++;
    }
  }
  return added;
}

module.exports = { fetch, sleep, decode_html_entities, add_cards };
