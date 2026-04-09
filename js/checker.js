/*
Just checks whether the chapter url actually EXISTS or not...
Currently proxy hosted on localhost. We could use some 3rd party proxy like:

https://corsproxy.io/?url=<url>			<= THIS is the BEST... It has CACHING!!!
https://proxy.corsfix.com/?<url>
https://corsproxy.org/?<url>
https://cors-proxy.htmldriven.com/?url=<url>

Buttt these hit rate limits FAST

⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣤⢤⣄⠀⠀⠀
⠀⠀⢀⡤⠖⠒⠒⢤⡀⠀⠀⢫⢸⡡⡏⡇⠀⠀
⠀⢀⡾⣤⣄⡀⠀⢀⠷⣄⢀⡼⠀⠑⠁⡇⠀⠀
⠀⠸⣷⣾⣿⡇⠀⣿⣾⡟⣼⡧⠖⠒⠒⠓⠒⡆
⠀⠀⠫⣉⠉⠀⠀⣉⣟⣸⠸⡀⠀⣀⣀⠀⠤⡇
⠀⢀⡤⠚⠓⠒⠋⠁⡤⢍⡆⡏⠁⠀⠀⠀⠀⡇
⠠⣏⠔⡆⠀⣀⡀⠀⡇⠀⠣⣽⡉⠁⠀⠉⠉⢹
⠀⠀⠀⡇⡸⠁⠙⢄⠃⠀⠀⠈⠯⠭⠥⠤⠎⠉
⠀⠀⠀⠉⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀


*/

const Checker = (
	() => {
		
		const PROXY =
			window.location.hostname === "localhost" ||
			window.location.hostname === "127.0.0.1" ||
			window.location.hostname === ""
				? "http://localhost:3000"
				: "https://mangalink.onrender.com";

		// Public CORS proxies used as fallback if our server is down.
		// Tried in order — first one that works wins.
		const PUBLIC_PROXIES = [
			url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
			url => `https://proxy.corsfix.com/?${url}`,
		];

		// Try fetching a URL through each public proxy in order.
		// Returns the Response of the first one that succeeds, or null if all fail.
		async function fetch_via_public_proxies(url)
		{
			for (const make_proxy_url of PUBLIC_PROXIES)
			{
				try
				{
					const res = await fetch(make_proxy_url(url), {
						signal: AbortSignal.timeout(8000)
					});
					// 404 from the proxy = chapter genuinely missing, stop trying
					if (res.status === 404) return res;
					if (res.ok) return res;
				}
				catch (_) { /* proxy itself failed, try next */ }
			}
			return null;
		}

		// Fallback for check_url: hit the target URL directly via public proxies
		// and check the response content-type / status.
		async function check_url_via_fallback(url_array)
		{
			for (const url of url_array)
			{
				try
				{
					const res = await fetch_via_public_proxies(url);
					if (!res) continue;

					const contentType = res.headers.get("content-type") || "";
					const isImage = /\.(webp|jpg|jpeg|png)$/i.test(url);
					const exists = isImage
						? contentType.includes("image")
						: contentType.includes("text/html");

					if (exists) return "found";
				}
				catch (_) { /* try next url */ }
			}
			return "unknown";
		}

		// Fallback for check_html_alt: fetch the page HTML via public proxies
		// and look for the alt text directly in the browser.
		async function check_html_alt_via_fallback({ url, alt })
		{
			try
			{
				const res = await fetch_via_public_proxies(url);
				if (!res) return "unknown";

				const html = await res.text();
				return html.includes(`alt="${alt}"`) ? "found" : "not_found";
			}
			catch (_) { return "unknown"; }
		}

		async function check_url(url_array)
		{
			try {
				// url_array is now ['url1', 'url2']
				const queryString = `?urls=${encodeURIComponent(JSON.stringify(url_array))}`;

				const res = await fetch(`${PROXY}/check${queryString}`, {
					signal: AbortSignal.timeout(5000) // Timeout of 20s
				});

				// 5xx = proxy is down (Render sleeping), treat as unknown not a definitive miss
				if (res.status >= 500) return check_url_via_fallback(url_array);
				if (!res.ok) return "not_found";

				const data = await res.json();
				return data.exists ? "found" : "not_found";
			}
			catch (err)
			{
				// TypeError: Failed to fetch = proxy unreachable, try public proxies
				console.error("Checker Error:", err);
				return check_url_via_fallback(url_array);
			}
		}

		// For sources with check_type "html_alt": fetch the page HTML and
		// look for an img whose alt attribute matches the expected string.
		async function check_html_alt({ url, alt })
		{
			try {
				const queryString = `?url=${url}&alt=${encodeURIComponent(alt)}`;

				const res = await fetch(`${PROXY}/check-html${queryString}`, {
					signal: AbortSignal.timeout(5000)
				});

				if (res.status >= 500) return check_html_alt_via_fallback({ url, alt });
				if (!res.ok) return "not_found";

				const data = await res.json();
				return data.exists ? "found" : "not_found";
			}
			catch (err)
			{
				// TypeError: Failed to fetch = proxy unreachable, try public proxies
				console.error("Checker (html_alt) Error:", err);
				return check_html_alt_via_fallback({ url, alt });
			}
		}

		function check_each(source_url_map, on_result)
		{
			for (const [name, val] of Object.entries(source_url_map))
			{
                // always_found = Flame Comics (can't check chapter URLs)
                if (val?.type === "always_found")
                {
					on_result(name, "browse");
					continue;
                }

				const promise = val?.type === "html_alt"
					? check_html_alt(val)
					: check_url(val);

				promise.then(status => on_result(name, status));
			}
		}

		return { check_url, check_each };
	}
)();