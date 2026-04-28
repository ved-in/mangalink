const fs   = require('fs');
const path = require('path');
const { normalise_title } = require('./helpers');

const STATE_FILE = path.join(__dirname, '..', '..', 'data', 'scrape_state.json');

function load_state()
{
	try
	{
		if (fs.existsSync(STATE_FILE))
		{
			const raw     = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
			const run        = raw._run        ?? 0;
			const status_run = raw._status_run ?? 0;
			const { _run, _status_run, ...entries } = raw;
			return { entries, run, status_run };
		}
	}
	catch (e)
	{
		console.warn(`[State] Could not load state file: ${e.message} -- starting fresh.`);
	}
	return { entries: {}, run: 0, status_run: 0 };
}

function save_state(state_entries, run, status_run)
{
	const dir = path.dirname(STATE_FILE);
	fs.mkdirSync(dir, { recursive: true });

	const to_write = { _run: run, _status_run: status_run, ...state_entries };
	fs.writeFileSync(STATE_FILE, JSON.stringify(to_write, null, 1), 'utf8');
	console.log(`\nWrote scrape_state.json (${Object.keys(state_entries).length} series entries, run=${run})`);
}

function build_state(merged, raw_by_src)
{
	const state = {};
	for (const series of merged)
	{
		if (!series.title) continue;
		const key = normalise_title(series.title);
		state[key] =
		{
			status:        series.status        || null,
			max_chapter:   series.max_chapter   ?? null,
			chapter_count: series.chapter_count ?? null,
			ua:            series.ua            ?? null,
			uf:            series.uf            ?? null,
		};
	}
	const HTML_SOURCE_PATTERNS =
	{
		'Demonic Scans': url => url.replace('https://demonicscans.org/manga/', '').replace(/\/$/, '').toLowerCase(),
		'Thunder Scans': url => url.match(/\/comics\/([^\/]+)\/?/)?.[1]?.toLowerCase() ?? null,
		'Violet Scans':  url => url.match(/\/comics\/([^\/]+)\/?/)?.[1]?.toLowerCase() ?? null,
		'ADK Scans':     url => url.replace(/^https?:\/\/[^\/]+\//, '').replace(/\/$/, '').toLowerCase() || null,
	};

	for (const series of merged)
	{
		if (!series.sources) continue;
		for (const [src_name, src_url] of Object.entries(series.sources))
		{
			const extractor = HTML_SOURCE_PATTERNS[src_name];
			if (!extractor) continue;

			const slug = extractor(src_url);
			if (!slug || state[slug]) continue;

			state[slug] =
			{
				max_chapter: series.max_chapter ?? null,
				status:      series.status      || null,
				ua:          series.ua          ?? null,
				uf:          series.uf          ?? null,
			};
		}
	}

	return state;
}

module.exports = { load_state, save_state, build_state };
