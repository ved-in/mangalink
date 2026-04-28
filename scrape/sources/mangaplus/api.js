'use strict';

const { sleep } = require('../../lib/helpers');

const API_BASE = 'http://jumpg-webapi.tokyo-cdn.com/api/title_list/all_v3';

const DEFAULT_HEADERS =
{
	'User-Agent': 'Mozilla/5.0 (compatible; MangaLinkScraper/1.0)',
	'Accept':     'application/octet-stream,*/*',
};

async function fetch_binary(url)
{
	const MAX_RETRIES = 5;
	const BASE_DELAY  = 1000;

	for (let attempt = 1; attempt <= MAX_RETRIES; attempt++)
	{
		try
		{
			const res       = await globalThis.fetch(url, { headers: DEFAULT_HEADERS });
			const arr_buf   = await res.arrayBuffer();
			const buf       = Buffer.from(arr_buf);
			return { status: res.status, buf };
		}
		catch (e)
		{
			if (attempt === MAX_RETRIES) throw e;
			const delay = BASE_DELAY * Math.pow(2, attempt - 1);
			console.warn(`[MangaPlus] Attempt ${attempt} failed for ${url}: ${e.message} -- retrying in ${delay}ms`);
			await sleep(delay);
		}
	}
}

function decode_varint(buf, pos)
{
	let result = 0;
	let shift  = 0;
	while (pos < buf.length)
	{
		const b = buf[pos++];
		result |= (b & 0x7F) << shift;
		if (!(b & 0x80)) break;
		shift += 7;
	}
	return [result, pos];
}

function read_field(buf, pos)
{
	if (pos >= buf.length) return [null, pos];

	let tag, val;
	try   { [tag, pos] = decode_varint(buf, pos); }
	catch { return [null, pos + 1]; }

	const field_num  = tag >> 3;
	const wire_type  = tag & 7;

	if (wire_type === 0)
	{
		[val, pos] = decode_varint(buf, pos);
		return [{ field_num, wire_type, value: val }, pos];
	}
	if (wire_type === 2)
	{
		let length;
		[length, pos] = decode_varint(buf, pos);
		val = buf.slice(pos, pos + length);
		pos += length;
		return [{ field_num, wire_type, value: val }, pos];
	}
	if (wire_type === 1) { val = buf.slice(pos, pos + 8); pos += 8; return [{ field_num, wire_type, value: val }, pos]; }
	if (wire_type === 5) { val = buf.slice(pos, pos + 4); pos += 4; return [{ field_num, wire_type, value: val }, pos]; }
	return [null, pos + 1];
}

function* iter_fields(buf)
{
	let pos = 0;
	while (pos < buf.length)
	{
		const [field, next_pos] = read_field(buf, pos);
		if (!field) { pos = next_pos; continue; }
		yield field;
		pos = next_pos;
	}
}

function buf_to_str(buf)
{
	try   { return buf.toString('utf8'); }
	catch { return ''; }
}

function stable_cover_url(raw_url)
{
	if (!raw_url) return null;
	const q = raw_url.indexOf('?');
	return q !== -1 ? raw_url.slice(0, q) : raw_url;
}

function parse_title_version(buf)
{
	const version = { title_id: null, title: null, author: null, cover_url: null };
	for (const { field_num, wire_type, value } of iter_fields(buf))
	{
		if (field_num === 1 && wire_type === 0) version.title_id  = value;
		if (field_num === 2 && wire_type === 2) version.title     = buf_to_str(value);
		if (field_num === 3 && wire_type === 2) version.author    = buf_to_str(value);
		if (field_num === 4 && wire_type === 2) version.cover_url = stable_cover_url(buf_to_str(value));
	}
	return version;
}

function parse_genre(buf)
{
	const genre = { name: null, slug: null };
	for (const { field_num, wire_type, value } of iter_fields(buf))
	{
		if (field_num === 1 && wire_type === 2) genre.name = buf_to_str(value);
		if (field_num === 2 && wire_type === 2) genre.slug = buf_to_str(value);
	}
	return genre;
}

function parse_title_group(buf)
{
	const group = { title: null, versions: [], genres: [], updated_at: null };
	for (const { field_num, wire_type, value } of iter_fields(buf))
	{
		if (field_num === 1 && wire_type === 2) group.title      = buf_to_str(value);
		if (field_num === 2 && wire_type === 2) group.versions.push(parse_title_version(value));
		if (field_num === 3 && wire_type === 2) group.genres.push(parse_genre(value));
		if (field_num === 5 && wire_type === 0) group.updated_at = value;
	}
	return group;
}

function parse_response(body)
{
	let inner_buf = null;
	for (const { field_num, wire_type, value } of iter_fields(body))
	{
		if (field_num === 1 && wire_type === 2) { inner_buf = value; break; }
	}
	if (!inner_buf) throw new Error('MangaPlus protobuf: outer field 1 not found');
	let title_list_buf = null;
	for (const { field_num, wire_type, value } of iter_fields(inner_buf))
	{
		if (field_num === 35 && wire_type === 2) { title_list_buf = value; break; }
	}
	if (!title_list_buf) throw new Error('MangaPlus protobuf: TitleList (field 35) not found');
	const groups = [];
	for (const { field_num, wire_type, value } of iter_fields(title_list_buf))
	{
		if (field_num === 3 && wire_type === 2) groups.push(parse_title_group(value));
	}
	return groups;
}

async function fetch_title_list(type)
{
	const url = `${API_BASE}?type=${type}&lang=eng&clang=eng`;
	const { status, buf } = await fetch_binary(url);

	if (status !== 200) throw new Error(`MangaPlus API returned HTTP ${status} for type=${type}`);

	return parse_response(buf);
}

const DETAIL_BASE = 'http://jumpg-webapi.tokyo-cdn.com/api/title_detailV3';

function normalise_chapter_num(raw)
{
	const s = (raw || '').trim().replace(/^#/, '');
	const n = parseFloat(s);
	if (!isNaN(n))
	{
		return n % 1 === 0 ? String(Math.floor(n)) : String(n);
	}
	return s; // "ex", "sp", etc.
}

function parse_chapter_entry(buf, is_locked)
{
	const entry = { chapter_id: null, number: null, name: null, is_locked };
	for (const { field_num, wire_type, value } of iter_fields(buf))
	{
		if (field_num === 2 && wire_type === 0) entry.chapter_id = value;
		if (field_num === 3 && wire_type === 2) entry.number     = normalise_chapter_num(buf_to_str(value));
		if (field_num === 4 && wire_type === 2) entry.name       = buf_to_str(value);
	}
	return entry;
}

function parse_title_detail(body)
{
	let inner = null;
	for (const { field_num, wire_type, value } of iter_fields(body))
	{
		if (field_num === 1 && wire_type === 2) { inner = value; break; }
	}
	if (!inner) return { chapters: [], max_chapter: null };
	let detail_view = null;
	for (const { field_num, wire_type, value } of iter_fields(inner))
	{
		if (field_num === 8 && wire_type === 2) { detail_view = value; break; }
	}
	if (!detail_view) return { chapters: [], max_chapter: null };
	const all_chapters = [];
	let group_label  = null; // last group's label = total shown (e.g. "50")

	for (const { field_num, wire_type, value } of iter_fields(detail_view))
	{
		if (field_num !== 28 || wire_type !== 2) continue;

		for (const { field_num: f2, wire_type: w2, value: v2 } of iter_fields(value))
		{
			if (f2 === 1 && w2 === 2) group_label = buf_to_str(v2);
			if (f2 === 2 && w2 === 2) all_chapters.push(parse_chapter_entry(v2, false)); // free
			if (f2 === 3 && w2 === 2) all_chapters.push(parse_chapter_entry(v2, true));  // locked
		}
	}
	let max_num    = -Infinity;
	let max_chapter = null;
	for (const ch of all_chapters)
	{
		const n = parseFloat(ch.number);
		if (!isNaN(n) && n > max_num) { max_num = n; max_chapter = ch.number; }
	}

	return { chapters: all_chapters, max_chapter };
}

async function fetch_title_detail(title_id)
{
	const url = `${DETAIL_BASE}?title_id=${title_id}&clang=eng`;
	const { status, buf } = await fetch_binary(url);

	if (status !== 200)
	{
		console.warn(`[MangaPlus] title_detailV3 returned HTTP ${status} for title_id=${title_id}`);
		return { chapters: [], max_chapter: null };
	}
	return parse_title_detail(buf);
}

module.exports = { fetch_title_list, fetch_title_detail };
