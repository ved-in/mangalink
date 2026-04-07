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
						timeout: 4000
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
			const urls = JSON.parse(urlsParam);

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

// /check-html?url=<chapter_page_url>&alt=<expected_alt_text>
// Fetches the chapter page HTML and checks whether an img with the given alt attribute exists
app.get(
	"/check-html", async (req, res) =>
	{
		const { url, alt } = req.query;
		console.log(`[TRYING] ${url}`);


		if (!url || !alt)
		{
			return res.status(400).json({ error: "Missing 'url' or 'alt' parameter" });
		}

		console.log(`[HTML-CHECK] ${url} | looking for alt="${alt}"`);

		const result = await fetch_html(url);

		if (result.status !== 200)
		{
			console.log(`[HTML-CHECK] Bad status ${result.status}`);
			return res.json({ exists: false });
		}

		// Look for alt="<expected text>" anywhere in the HTML
		const needle = `alt="${alt}"`;
		const exists = result.body.includes(needle);

		console.log(`[HTML-CHECK] ${exists ? "FOUND" : "NOT FOUND"}: ${needle}`);
		return res.json({ exists, url });
	}
);

const PORT = process.env.PORT || 3000;
app.listen(
	PORT,
	() => { console.log(`Proxy started`); }
);