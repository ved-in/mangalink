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

const PORT = process.env.PORT || 3000;
app.listen(
	PORT,
	() => { console.log(`Proxy started`); }
);