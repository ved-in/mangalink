/**
 * scrape/sources/temple/patterns.js
 *
 * Regex patterns and HTML extraction for Temple Toons.
 *
 * ── Why regex instead of JSON.parse? ─────────────────────────────────────────
 *
 * Temple Toons is a Next.js site that embeds ALL series data as an escaped
 * JSON string inside the __NEXT_DATA__ <script> tag. The escaping level varies
 * between Next.js deployments:
 *
 *   Double-escaped:  \\\"series_slug\\\":\\\"value\\\"   (literal \\" in HTML)
 *   Single-escaped:  \"series_slug\":\"value\"            (literal \" in HTML)
 *
 * Unescaping the full blob and then JSON-parsing it requires carefully
 * stripping multiple layers, which is fragile. Targeted regex on the raw
 * escaped string is simpler and equally reliable for the five fields we need.
 *
 * ── Alignment problem and how we solve it ────────────────────────────────────
 *
 * A naive approach extracts all slug matches into one array, all title matches
 * into another, and so on, then zips them by index. This breaks for `_count`
 * and `status` because not every series entry has those fields -- the arrays
 * end up shorter than the slug array, and index i in ccounts[] no longer
 * corresponds to index i in slugs[].
 *
 * Fix: for `_count` (chapter count), instead of a global scan we slice the raw
 * HTML between consecutive slug match positions and run the count regex only on
 * that slice. A null is stored when the field is absent. This guarantees
 * ccounts[i] always corresponds to slugs[i].
 */

// ── Pattern sets ──────────────────────────────────────────────────────────────

// Each object has five named RegExp objects. All use the /g flag so exec()
// can be called repeatedly to iterate through matches.

const PATTERNS =
{
	// Double-escaped: used when the JSON string is nested inside another JS string.
	// The literal text in the HTML looks like:   \\\"series_slug\\\":\\\"value\\\"
	double:
	{
		slug:   /\\\\\\\"series_slug\\\\\\\":\\\\\\\"([a-z0-9\-]+)\\\\\\\"/g,
		title:  /\\\\\\\"title\\\\\\\":\\\\\\\"([^\\\\]+)\\\\\\\"/g,
		thumb:  /\\\\\\\"thumbnail\\\\\\\":\\\\\\\"(https:[^\\\\]+)\\\\\\\"/g,
		ccount: /\\\\\\\"_count\\\\\\\":\\\\\\{[^}]*\\\\\\\"Chapter\\\\\\\":(\\d+)/g,
		status: /\\\\\\\"status\\\\\\\":\\\\\\\"([^\\\\]+)\\\\\\\"/g,
	},

	// Single-escaped: used when the JSON string is escaped only once.
	// The literal text in the HTML looks like:   \"series_slug\":\"value\"
	single:
	{
		slug:   /\\\"series_slug\\\":\\\"([a-z0-9\-]+)\\\"/g,
		title:  /\\\"title\\\":\\\"([^\\\"]+)\\\"/g,
		thumb:  /\\\"thumbnail\\\":\\\"(https:[^\\\"]+)\\\"/g,
		ccount: /\\\"_count\\\":\{[^}]*\\\"Chapter\\\":(\\d+)/g,
		status: /\\\"status\\\":\\\"([^\\\"]+)\\\"/g,
	},
};

// ── Main extraction function ──────────────────────────────────────────────────

/**
 * Extract all five fields from the raw listing page HTML using one pattern set.
 *
 * Returns:
 *   slugs[]    -- series_slug for each series     (index-aligned)
 *   titles[]   -- title                           (index-aligned)
 *   thumbs[]   -- thumbnail URL                   (index-aligned)
 *   ccounts[]  -- chapter count or null           (index-aligned, see alignment fix above)
 *   statuses[] -- status string                   (NOT index-aligned, extracted globally)
 *
 * Note on statuses: status is currently extracted globally (not per-series),
 * which means statuses[i] may not correspond to slugs[i] if some series lack
 * the status field. This is acceptable because status is only a nice-to-have
 * on the listing page -- it is cross-checked against other sources in merge().
 *
 * @param {string} html   Raw HTML of the Temple Toons /comics listing page.
 * @param {object} pset   One of the two pattern sets above.
 * @returns {{ slugs, titles, thumbs, ccounts, statuses }}
 */
function run_patterns(html, pset)
{
	// Reset all patterns (they are stateful /g regexes).
	pset.slug.lastIndex   = 0;
	pset.title.lastIndex  = 0;
	pset.thumb.lastIndex  = 0;
	pset.ccount.lastIndex = 0;
	pset.status.lastIndex = 0;

	const slugs    = [];
	const titles   = [];
	const thumbs   = [];
	const statuses = [];
	let m;

	// Collect slug match positions alongside the slug values -- we need the
	// byte offset to slice the HTML per-series for the aligned ccount extraction.
	const slug_positions = [];
	while ((m = pset.slug.exec(html)) !== null)
	{
		slugs.push(m[1]);
		slug_positions.push(m.index);
	}

	while ((m = pset.title.exec(html))  !== null) titles.push(m[1]);
	while ((m = pset.thumb.exec(html))  !== null) thumbs.push(m[1]);
	while ((m = pset.status.exec(html)) !== null) statuses.push(m[1]);

	// ── Per-series ccount extraction (alignment fix) ──────────────────────────
	// Slice the HTML between consecutive slug positions and search within each
	// slice. This ensures ccounts[i] corresponds to slugs[i] even when some
	// series lack the _count field entirely.

	const ccounts = new Array(slugs.length).fill(null);

	for (let i = 0; i < slug_positions.length; i++)
	{
		const start = slug_positions[i];
		// Cap the slice at 2 KB per entry -- the _count field always appears
		// within a few hundred bytes of the slug match.
		const end   = slug_positions[i + 1] ?? (start + 2000);
		const chunk = html.slice(start, end);

		pset.ccount.lastIndex = 0;
		const cm = pset.ccount.exec(chunk);
		if (cm) ccounts[i] = parseInt(cm[1], 10);
	}

	return { slugs, titles, thumbs, ccounts, statuses };
}

/**
 * Try double-escaped patterns first, fall back to single-escaped.
 * A result set is valid if slugs, titles, and thumbs all have the same
 * non-zero count. Returns the best result and which escape level was used.
 *
 * @param {string} html
 * @returns {{ matches: object, escape_level: 'double'|'single' }}
 */
function extract_with_fallback(html)
{
	let matches      = run_patterns(html, PATTERNS.double);
	let escape_level = 'double';

	const valid = m =>
		m.slugs.length > 0 &&
		m.slugs.length === m.titles.length &&
		m.slugs.length === m.thumbs.length;

	if (!valid(matches))
	{
		console.log('[Temple] Double-escaped patterns yielded no results, trying single-escaped...');
		matches      = run_patterns(html, PATTERNS.single);
		escape_level = 'single';
	}

	return { matches, escape_level };
}

module.exports = { PATTERNS, run_patterns, extract_with_fallback };
