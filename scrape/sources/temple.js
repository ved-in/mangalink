/*
 * scrape/sources/temple.js -- Temple Toons scraper
 *
 * DISCOVERY:
 *   Temple Toons embeds ALL series data as a JSON blob inside the HTML of their
 *   /comics listing page. The JSON is stored as an escaped string inside a
 *   <script> tag in the Next.js __NEXT_DATA__ block.
 *
 *   The entire page renders in just TWO LINES of HTML:
 *     Line 1: all HTML + inline CSS
 *     Line 2: all JavaScript including the JSON data
 *
 *   The JSON escaping level varies across Next.js versions:
 *     - Double-escaped: \\\"series_slug\\\":\\\"value\\\"  (literal \\" in HTML)
 *     - Single-escaped: \"series_slug\":\"value\"           (literal \" in HTML)
 *   The scraper tries double-escaped first, then falls back to single-escaped.
 *
 * WHY REGEX INSTEAD OF JSON.PARSE?
 *   Parsing the JSON directly requires stripping multiple layers of escaping, which
 *   took hours to get right. Using targeted regex patterns on the raw escaped string
 *   turned out to be far simpler and equally reliable.
 *   We extract slugs, titles, thumbnails, and chapter counts with four separate patterns.
 *
 * CHAPTER SLUGS:
 *   Each series page contains a chapter list with "chapter_name" and "chapter_slug"
 *   for every chapter. We fetch and store ALL chapters (not just non-integer ones)
 *   because Temple Toons does not follow a predictable chapter URL pattern.
 *
 * GUARD:
 *   If the four regex match counts differ (sign that the page structure changed),
 *   the scraper aborts entirely rather than producing corrupted data.
 */

const { fetch, sleep, decode_html_entities, add_cards } = require('./helpers');

// How many series pages to fetch in parallel when loading chapter lists.
const CONCURRENCY = 5;

// Two sets of patterns for the two escaping levels Next.js uses.
// Double-escaped: the JSON string is escaped inside another JS string.
// Single-escaped: the JSON string is escaped only once.
const PATTERNS = {
    double: {
        slug:   /\\\\\"series_slug\\\\\":\\\\\"([a-z0-9\-]+)\\\\\"/g,
        title:  /\\\\\"title\\\\\":\\\\\"([^\\\\]+)\\\\\"/g,
        thumb:  /\\\\\"thumbnail\\\\\":\\\\\"(https:[^\\\\]+)\\\\\"/g,
        ccount: /\\\\\"_count\\\\\":\\\\\{[^}]*\\\\\"Chapter\\\\\":(\\d+)/g,
    },
    single: {
        slug:   /\\\"series_slug\\\":\\\"([a-z0-9\-]+)\\\"/g,
        title:  /\\\"title\\\":\\\"([^\\\"]+)\\\"/g,
        thumb:  /\\\"thumbnail\\\":\\\"(https:[^\\\"]+)\\\"/g,
        ccount: /\\\"_count\\\":\{[^}]*\\\"Chapter\\\":(\\d+)/g,
    },
};

// Run all four patterns from a set against html, return { slugs, titles, thumbs, ccounts } arrays.
// Resets lastIndex on each pattern before running so the function is safe to call multiple times.
function run_patterns(html, pset)
{
    pset.slug.lastIndex   = 0;
    pset.title.lastIndex  = 0;
    pset.thumb.lastIndex  = 0;
    pset.ccount.lastIndex = 0;

    const slugs   = [];
    const titles  = [];
    const thumbs  = [];
    const ccounts = [];
    let m;

    while ((m = pset.slug.exec(html))   !== null) slugs.push(m[1]);
    while ((m = pset.title.exec(html))  !== null) titles.push(m[1]);
    while ((m = pset.thumb.exec(html))  !== null) thumbs.push(m[1]);
    while ((m = pset.ccount.exec(html)) !== null) ccounts.push(parseInt(m[1], 10));

    return { slugs, titles, thumbs, ccounts };
}

// Convert a chapter slug into a float chapter number.
// e.g. "chapter-12-5" -> 12.5, "chapter-0" -> 0
// Returns null if the slug cannot be parsed.
function parse_chapter_slug(slug)
{
    if (!slug) return null;
    // Strip any leading numeric prefix (e.g. "01-chapter-5" -> "chapter-5").
    const clean    = slug.replace(/^\d+-/, '');
    // Strip the "chapter-" / "ch-" etc. prefix.
    const stripped = clean.replace(/^(?:chapter|ch|episode|ep)-/i, '');
    // Convert trailing "-N" to ".N" for decimal chapters (e.g. "12-5" -> "12.5").
    const normalised = stripped.replace(/-(\d+)$/, '.$1');
    const n = parseFloat(normalised);
    return isNaN(n) ? null : n;
}

// Fetch all chapters for a single series page using regex on the escaped HTML.
// Returns an array of { name, chapter_slug } objects.
async function fetch_all_chapters(series_url)
{
    try
    {
        const res  = await fetch(series_url);
        if (res.status !== 200) return [];

        const html     = res.body;
        const chapters = [];

        // Match escaped "chapter_name":"..." and "chapter_slug":"..." pairs.
        // Single-escaped level is consistent on individual series pages.
        const pattern = /\\\"chapter_name\\\":\\\"([^\\\"]+)\\\".*?\\\"chapter_slug\\\":\\\"([^\\\"]+)\\\"/g;
        let m;
        while ((m = pattern.exec(html)) !== null)
        {
            chapters.push({
                name:         m[1],
                chapter_slug: m[2],
            });
        }

        // The page lists chapters newest-first; reverse so index 0 is chapter 1.
        chapters.reverse();
        return chapters;
    }
    catch (e)
    {
        console.error(`[Temple] Failed to fetch chapters for ${series_url}: ${e.message}`);
        return [];
    }
}

async function scrape_temple_toons()
{
    console.log('[Temple] Starting...');
    const all_series = [];
    const seen_slugs = new Set();

    try
    {
        const res = await fetch('https://templetoons.com/comics');
        if (res.status !== 200)
        {
            console.error(`[Temple] HTTP ${res.status}`);
            return [];
        }

        const html = res.body;

        // Try double-escaped patterns first, fall back to single-escaped.
        // A result set is considered valid if all four counts match and slugs > 0.
        let matches      = run_patterns(html, PATTERNS.double);
        let escape_level = 'double';

        if (matches.slugs.length === 0 || matches.slugs.length !== matches.titles.length || matches.slugs.length !== matches.thumbs.length)
        {
            console.log('[Temple] Double-escaped patterns yielded no results, trying single-escaped...');
            matches      = run_patterns(html, PATTERNS.single);
            escape_level = 'single';
        }

        const { slugs: slug_matches, titles: title_matches, thumbs: thumb_matches, ccounts: ccount_matches } = matches;

        console.log(`[Temple] escape_level=${escape_level}, slugs=${slug_matches.length}, titles=${title_matches.length}, thumbs=${thumb_matches.length}`);

        // If counts still differ, the page structure changed. Abort to avoid corrupted data.
        if (slug_matches.length === 0 || slug_matches.length !== title_matches.length || slug_matches.length !== thumb_matches.length)
        {
            console.error(`[Temple] Length mismatch -- aborting to prevent data corruption`);
            console.error(`  slugs: ${slug_matches.length}, titles: ${title_matches.length}, thumbs: ${thumb_matches.length}`);
            return [];
        }

        const count = slug_matches.length;
        for (let i = 1; i < count; i++)
        {
            const series_slug = slug_matches[i];
            const title       = title_matches[i];
            const cover       = thumb_matches[i];

            if (!series_slug || seen_slugs.has(series_slug)) continue;
            // Titles of length 1 are almost certainly stray single characters from a parse error.
            if (!title || title.length <= 1) continue;

            const series_url = `https://templetoons.com/comic/${series_slug}`;

            seen_slugs.add(series_slug);
            all_series.push({
                title:       decode_html_entities(title),
                slug:        series_url,
                cover,
                sources:     { 'Temple Toons': series_url },
                chapters:    { 'Temple Toons': [] },
                max_chapter: ccount_matches[i] ?? null,
                _series_url: series_url,  // temporary
            });
        }

        console.log(`[Temple] Fetching chapters for ${all_series.length} series...`);

        // Fetch full chapter lists for each series in small parallel batches.
        for (let i = 0; i < all_series.length; i += CONCURRENCY)
        {
            const batch = all_series.slice(i, i + CONCURRENCY);
            await Promise.all(batch.map(async (s) => {
                const chapters = await fetch_all_chapters(s._series_url);
                if (chapters.length > 0)
                {
                    s.chapters['Temple Toons'] = chapters;

                    // Recompute max_chapter from the scraped slugs -- more accurate
                    // than the _count field on the listing page.
                    let max = null;
                    for (const ch of chapters)
                    {
                        const n = parse_chapter_slug(ch.chapter_slug);
                        if (n !== null && (max === null || n > max)) max = n;
                    }
                    if (max !== null) s.max_chapter = max;
                }
            }));
            console.log(`[Temple] Chapters fetched: ${Math.min(i + CONCURRENCY, all_series.length)}/${all_series.length}`);
        }

        for (const s of all_series) delete s._series_url;
    }
    catch (e)
    {
        console.error(`[Temple] Error: ${e.message}`);
        console.error(e.stack);
        return [];
    }

    console.log(`[Temple] Done. Found ${all_series.length} series.`);
    return all_series;
}

module.exports = { scrape_temple_toons };