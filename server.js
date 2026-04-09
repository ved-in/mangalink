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

process.on(
	"uncaughtException",
	(err) => {
		console.error("UNCAUGHT EXCEPTION:", err);
		// Keep the process alive, log and continue
	}
);

process.on(
	"unhandledRejection",
	(reason, promise) => {
		console.error("UNHANDLED REJECTION at:", promise, "reason:", reason);
		// Do not exit, just log
	}
);


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
						method: "HEAD",
						hostname: parsed.hostname,
						path: parsed.pathname + parsed.search,
						timeout: 4000
					},
					(res) => { resolve({ status: res.statusCode, contentType: res.headers["content-type"] || "" }); }
				);

				req.on("error", (err) => {
					console.error(`fetch_meta error for ${target_url}:`, err.message);
					resolve({ status: 404, contentType: "" });
				});

				req.on("timeout", () => {
					req.destroy();
					resolve({ status: 408, contentType: "" });
				});

				const abortTimer = setTimeout(() => {
					req.destroy();
					resolve({ status: 408, contentType: "" });
				}, 5000);

				req.on("response", () => clearTimeout(abortTimer));
				req.end();
			}
			catch (e)
			{
				console.error(`fetch_meta parse error for ${target_url}:`, e.message);
				resolve({ status: 400, contentType: "" });
			}
		}
	);
}

// Fetches a full HTML page and returns its body as a string.
// Used by /check-html to scan for alt text without a headless browser.
async function fetch_html(target_url)
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
						timeout: 8000,
					},
					(res) =>
					{
						let body = "";
						res.setEncoding("utf8");
						res.on("data", chunk => { body += chunk; });
						res.on("end", () => resolve({ status: res.statusCode, body }));
					}
				);

				req.on("error", (err) => {
					console.error(`fetch_html error for ${target_url}:`, err.message);
					resolve({ status: 404, body: "" });
				});

				req.on("timeout", () => {
					req.destroy();
					resolve({ status: 408, body: "" });
				});

				// Extra safety timeout
				const abortTimer = setTimeout(() => {
					req.destroy();
					resolve({ status: 408, body: "" });
				}, 10000);

				req.on("response", () => clearTimeout(abortTimer));
				req.end();
			}
			catch (e)
			{
				console.error(`fetch_html parse error for ${target_url}:`, e.message);
				resolve({ status: 400, body: "" });
			}
		}
	);
}

app.get(
	"/check", async (req, res) => 
	{
		const requestTimeout = setTimeout(() => {
			if (!res.headersSent) {
				res.status(504).json({ error: "Proxy timeout – no response from upstream" });
			}
		}, 10000);

		try {
			const urlsParam = req.query.urls;
			if (!urlsParam)
			{
				clearTimeout(requestTimeout);
				return res.status(400).json({ error: "Missing 'urls' parameter" });
			}

			let urls;
			try
			{
				urls = JSON.parse(urlsParam);
			}
			catch (parseErr)
			{
				clearTimeout(requestTimeout);
				return res.status(400).json({ error: "Invalid JSON array in 'urls' parameter" });
			}

			for (const url of urls)
			{
				console.log(`[TRYING] ${url}`);
				const result = await fetch_meta(url);

				const isImage = /\.(webp|jpg|jpeg|png)$/i.test(url);
				const exists = isImage
					? (result.status === 200 && result.contentType.includes("image"))
					: (result.status === 200 && result.contentType.includes("text/html"));

				if (exists)
				{
					console.log(`[SUCCESS] Found: ${url}`);
					clearTimeout(requestTimeout);
					return res.json({ exists: true, url: url });
				}
			}

			clearTimeout(requestTimeout);
			res.json({ exists: false });

		}
		catch (e) 
		{
			console.error("Unhandled error in /check:", e);
			clearTimeout(requestTimeout);
			if (!res.headersSent) {
				res.status(500).json({ error: "Internal server error" });
			}
		}
	}
);

// /check-html?url=<chapter_page_url>&alt=<expected_alt_text>
// Fetches the chapter page HTML and checks whether an img with the given alt attribute exists
app.get(
	"/check-html", async (req, res) =>
	{
		const requestTimeout = setTimeout(() => {
			if (!res.headersSent) {
			res.status(504).json({ error: "Proxy timeout - no response from upstream" });
			}
		}, 12000);

		try {
			const { url, alt } = req.query;
			if (!url || !alt)
			{
				clearTimeout(requestTimeout);
				return res.status(400).json({ error: "Missing 'url' or 'alt' parameter" });
			}

			console.log(`[HTML-CHECK] ${url} | looking for alt="${alt}"`);
			const result = await fetch_html(url);

			if (result.status !== 200)
			{
				console.log(`[HTML-CHECK] Bad status ${result.status}`);
				clearTimeout(requestTimeout);
				return res.json({ exists: false });
			}

			const needle = `alt="${alt}"`;
			const exists = result.body.includes(needle);
			console.log(`[HTML-CHECK] ${exists ? "FOUND" : "NOT FOUND"}: ${needle}`);
			clearTimeout(requestTimeout);
			res.json({ exists, url });
		}
		catch (err)
		{
			console.error("Unhandled error in /check-html:", err);
			clearTimeout(requestTimeout);
			if (!res.headersSent)
			{
				res.status(500).json({ error: "Internal server error" });
			}
		}
	}
);

const PORT = process.env.PORT || 3000;
const server = app.listen(
	PORT,
	() => { console.log(`Proxy started`); }
);

server.on(
	"error",
	(err) => {
		console.error("Server failed to start:", err);
		process.exit(1);
	}
);