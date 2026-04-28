'use strict';

const { fetch_title_list, fetch_title_detail } = require('./api');
const { sleep, normalise_title }               = require('../../lib/helpers');

const SOURCE_NAME        = 'MangaPlus';
const SERIES_BASE        = 'https://mangaplus.shueisha.co.jp/titles';
const CONCURRENCY_LIMIT  = 1;
const BATCH_DELAY_MS     = 500;

async function pool(tasks, limit) {
	const results = new Array(tasks.length);
	let i = 0;
	async function worker() {
		while (i < tasks.length) {
			const idx = i++;
			try   { results[idx] = await tasks[idx](); }
			catch { results[idx] = null; }
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
	return results;
}

function group_to_bare(group, status) {
	if (!group.title || !group.versions.length) return null;
	const canonical = group.versions.reduce(
		(best, v) => (v.title_id !== null && (best === null || v.title_id < best.title_id)) ? v : best,
		null
	);
	if (!canonical?.title_id) return null;
	return {
		title:      group.title,
		title_id:   canonical.title_id,
		cover:      canonical.cover_url ?? group.versions.find(v => v.cover_url)?.cover_url ?? null,
		author:     canonical.author || null,
		status,
		ua:         group.updated_at ? new Date(group.updated_at * 1000).toISOString() : null,
		updated_at: group.updated_at ?? null,
	};
}

async function enrich_series(bare, prev, run) {
	const series_url = `${SERIES_BASE}/${bare.title_id}`;
	const prev_ua    = prev?.ua ?? null;
	const unchanged  = prev_ua && bare.ua && bare.ua === prev_ua;
	const prev_chs   = prev?.chapters?.[SOURCE_NAME] ?? null;

	let chapters    = [];
	let max_chapter = null;

	if (unchanged && prev_chs) {
		chapters    = prev_chs;
		max_chapter = prev?.max_chapter ?? null;
	} else {
		const detail = await fetch_title_detail(bare.title_id);
		chapters = detail.chapters.map(ch => ({
			chapter:      ch.number,
			name:         ch.name || '',
			chapter_slug: String(ch.chapter_id),
			is_locked:    ch.is_locked,
		}));
		max_chapter = detail.max_chapter;
	}

	const uf = (!prev_ua || bare.ua > prev_ua) ? run : (prev?.uf ?? null);

	return {
		title:       bare.title,
		cover:       bare.cover,
		author:      bare.author,
		status:      bare.status,
		sources:     { [SOURCE_NAME]: series_url },
		max_chapter,
		chapters:    { [SOURCE_NAME]: chapters },
		ua:          bare.ua,
		uf,
	};
}

async function fetch_catalogue(type, status) {
	let groups;
	try {
		groups = await fetch_title_list(type);
		console.log(`[MangaPlus] ${type}: ${groups.length} title groups`);
	} catch (e) {
		console.error(`[MangaPlus] Failed to fetch ${type}: ${e.message}`);
		return new Map();
	}
	const map = new Map();
	for (const group of groups) {
		const bare = group_to_bare(group, status);
		if (!bare) continue;
		const key = normalise_title(bare.title);
		if (!map.has(key)) map.set(key, bare);
	}
	return map;
}

async function scrape_mangaplus(opts = {}) {
	const state = opts.state ?? null;
	const run   = opts.run   ?? 0;

	console.log('[MangaPlus] Phase 1: fetching title lists...');
	const [ongoing_map, completed_map] = await Promise.all([
		fetch_catalogue('serializing', 'Ongoing'),
		fetch_catalogue('completed',   'Completed'),
	]);

	const merged_map = new Map(completed_map);
	for (const [key, bare] of ongoing_map) merged_map.set(key, bare);

	const bare_list = [...merged_map.values()];
	console.log(`[MangaPlus] Phase 2: fetching detail for ${bare_list.length} series...`);

	const all_series = [];
	for (let start = 0; start < bare_list.length; start += CONCURRENCY_LIMIT) {
		const batch = bare_list.slice(start, start + CONCURRENCY_LIMIT);
		const tasks = batch.map(bare => async () => {
			const key  = normalise_title(bare.title);
			const prev = state ? state[key] : null;
			return enrich_series(bare, prev, run);
		});
		const results = await pool(tasks, CONCURRENCY_LIMIT);
		for (const s of results) if (s) all_series.push(s);
		if (start + CONCURRENCY_LIMIT < bare_list.length) await sleep(BATCH_DELAY_MS);
	}

	console.log(`[MangaPlus] Done. ${all_series.length} series scraped.`);
	return all_series;
}

module.exports = { scrape_mangaplus };
