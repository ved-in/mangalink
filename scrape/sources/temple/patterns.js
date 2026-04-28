const PATTERNS =
{
	double:
	{
		slug:   /\\\\\\\"series_slug\\\\\\\":\\\\\\\"([a-z0-9\-]+)\\\\\\\"/g,
		title:  /\\\\\\\"title\\\\\\\":\\\\\\\"([^\\\\]+)\\\\\\\"/g,
		thumb:  /\\\\\\\"thumbnail\\\\\\\":\\\\\\\"(https:[^\\\\]+)\\\\\\\"/g,
		ccount: /\\\\\\\"_count\\\\\\\":\\\\\\{[^}]*\\\\\\\"Chapter\\\\\\\":(\\d+)/g,
		status: /\\\\\\\"status\\\\\\\":\\\\\\\"([^\\\\]+)\\\\\\\"/g,
	},
	single:
	{
		slug:   /\\\"series_slug\\\":\\\"([a-z0-9\-]+)\\\"/g,
		title:  /\\\"title\\\":\\\"([^\\\"]+)\\\"/g,
		thumb:  /\\\"thumbnail\\\":\\\"(https:[^\\\"]+)\\\"/g,
		ccount: /\\\"_count\\\":\{[^}]*\\\"Chapter\\\":(\\d+)/g,
		status: /\\\"status\\\":\\\"([^\\\"]+)\\\"/g,
	},
};

function run_patterns(html, pset)
{
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
	const slug_positions = [];
	while ((m = pset.slug.exec(html)) !== null)
	{
		slugs.push(m[1]);
		slug_positions.push(m.index);
	}

	while ((m = pset.title.exec(html))  !== null) titles.push(m[1]);
	while ((m = pset.thumb.exec(html))  !== null) thumbs.push(m[1]);
	while ((m = pset.status.exec(html)) !== null) statuses.push(m[1]);

	const ccounts = new Array(slugs.length).fill(null);

	for (let i = 0; i < slug_positions.length; i++)
	{
		const start = slug_positions[i];
		const end   = slug_positions[i + 1] ?? (start + 2000);
		const chunk = html.slice(start, end);

		pset.ccount.lastIndex = 0;
		const cm = pset.ccount.exec(chunk);
		if (cm) ccounts[i] = parseInt(cm[1], 10);
	}

	return { slugs, titles, thumbs, ccounts, statuses };
}

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
