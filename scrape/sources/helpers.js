const https = require('https');
const http  = require('http');
const zlib  = require('zlib');

const MAX_REDIRECTS = 5;

function _fetch_one(url, opts) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MangaLinkScraper/1.0)',
        'Accept': 'text/html,application/json,*/*',
        'Accept-Encoding': 'gzip, deflate',
        ...opts.headers,
      },
      method: opts.method || 'GET',
    };

    const req = lib.request(url, options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
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

async function fetch(url, opts = {}) {
  let current_url = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await _fetch_one(current_url, opts);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      // Resolve relative redirects against the current URL
      current_url = new URL(res.headers.location, current_url).href;
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects (>${MAX_REDIRECTS}) for ${url}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function decode_html_entities(str) {
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, '\u2019')
    .replace(/&#038;/g, '&')
    .trim();
}

// Deduplicates and pushes cards into all_series using seen_slugs.
// Returns the number of newly added items.
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