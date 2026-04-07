/*
Proxy see, proxy tell
Fuck CORS... Life would have been so easier otherwise

Port = 3000
*/

const express = require("express");
const https = require("https");
const http = require("http");
const cors = require("cors");

const app = express();
app.use(cors());
// TESTED (2026-04-07):
// - node --check passed for this file.
// - Manual HTTP probes confirmed Demonic chapter pages return 200 for valid/invalid chapters,
//   so parser-based image validation path is used for Demonic URLs.
// - Server cache + URL dedupe paths verified in code-level flow; deploy/runtime load test still pending.
const CACHE_TTL_MS = 60 * 60 * 1000;
const check_cache = new Map();

function cache_get(key)
{
	const hit = check_cache.get(key);
	if (!hit) return null;
	if ((Date.now() - hit.ts) > CACHE_TTL_MS) {
		check_cache.delete(key);
		return null;
	}
	return hit.value;
}

function cache_set(key, value)
{
	check_cache.set(key, { ts: Date.now(), value });
}

async function fetch_meta(target_url)
{
	return new Promise(
		(resolve) => 
		{
			try
			{
				const parsed = new URL(target_url);
				const lib = parsed.protocol === "https:" ? https : http;

				const req = lib.request(
					{
						method: "GET",
						hostname: parsed.hostname,
						path: parsed.pathname + parsed.search,
						timeout: 4000,
						headers: {
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
							"Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
							"Referer": "https://demonicscans.org/"
						}
					},
					(res) => { resolve({ status: res.statusCode, contentType: res.headers["content-type"] || "" }); }
				);

				req.on("error", () => resolve({ status: 404 }));
				req.on("timeout", () => { req.destroy(); resolve({ status: 408 }); });
				req.end();
			}
			catch (e)
			{
				resolve({ status: 400 });
			}
		}
	);
}

async function fetch_text(target_url)
{
	return new Promise(
		(resolve) =>
		{
			try
			{
				const parsed = new URL(target_url);
				const lib = parsed.protocol === "https:" ? https : http;

				const req = lib.request(
					{
						method: "GET",
						hostname: parsed.hostname,
						path: parsed.pathname + parsed.search,
						timeout: 7000,
						headers: {
							"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
							"Accept": "text/html,*/*;q=0.9",
							"Referer": "https://demonicscans.org/"
						}
					},
					(res) => {
						let body = "";
						res.on("data", chunk => { body += chunk.toString(); });
						res.on("end", () => resolve({ status: res.statusCode, body }));
					}
				);

				req.on("error", () => resolve({ status: 404, body: "" }));
				req.on("timeout", () => { req.destroy(); resolve({ status: 408, body: "" }); });
				req.end();
			}
			catch (e)
			{
				resolve({ status: 400, body: "" });
			}
		}
	);
}

function extract_first_demonic_image(html)
{
	const regex = /class="imgholder"[^>]*src="([^"]+)"/gi;
	let match;
	while ((match = regex.exec(html)) !== null)
	{
		const src = match[1];
		if (!src) continue;
		if (!src.startsWith("http")) continue;
		if (src.includes("/img/free_ads.jpg")) continue;
		return src;
	}
	return null;
}

function is_demonic_chapter_url(url)
{
	try {
		const parsed = new URL(url);
		return parsed.hostname.includes("demonicscans.org") && /\/title\/.+\/chapter\/[^/]+\/\d+/.test(parsed.pathname);
	}
	catch {
		return false;
	}
}

async function check_candidate(url)
{
	const cache_key = `candidate:${url}`;
	const cached = cache_get(cache_key);
	if (cached) return cached;

	if (is_demonic_chapter_url(url))
	{
		const page = await fetch_text(url);
		if (page.status !== 200)
		{
			const out = { exists: false };
			cache_set(cache_key, out);
			return out;
		}

		const img = extract_first_demonic_image(page.body);
		if (!img)
		{
			const out = { exists: false };
			cache_set(cache_key, out);
			return out;
		}

		const meta = await fetch_meta(img);
		const out = (meta.status === 200 && String(meta.contentType || "").includes("image"))
			? { exists: true, url }
			: { exists: false };
		cache_set(cache_key, out);
		return out;
	}

	const result = await fetch_meta(url);
	const isImage = /\.(webp|jpg|jpeg|png)$/i.test(url);
	const exists = isImage
		? (result.status === 200 && result.contentType.includes("image"))
		: (result.status === 200 && result.contentType.includes("text/html"));
	const out = exists ? { exists: true, url } : { exists: false };
	cache_set(cache_key, out);
	return out;
}

app.get(
	"/check", async (req, res) => 
	{
		const urlsParam = req.query.urls;

		if (!urlsParam)
		{
			return res.status(400).json({ error: "Missing 'urls' parameter" });
		}

		try
		{
			const urls = Array.from(new Set(JSON.parse(urlsParam) || []));

			for (const url of urls)
			{
				console.log(`[TRYING] ${url}`);
				const result = await check_candidate(url);
				if (result.exists)
				{
					console.log(`[SUCCESS] Found: ${url}`);
					return res.json({ exists: true, url: url });
				}
			}

			res.json({ exists: false });

		}
		catch (e)
		{
			console.error("Server Parse Error:", e.message);
			res.status(400).json({ error: "Invalid JSON array in 'urls' parameter" });
		}
	}
);

const PORT = process.env.PORT || 3000;
app.listen(
	PORT,
	() => { console.log(`Proxy started`); }
);
