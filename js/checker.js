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

		async function check_url(url_array)
		{
			try {
				// url_array is now ['url1', 'url2']
				const queryString = `?urls=${encodeURIComponent(JSON.stringify(url_array))}`;

				const res = await fetch(`${PROXY}/check${queryString}`, {
					signal: AbortSignal.timeout(20000) // Timeout of 20s
				});

				if (!res.ok) return "not_found";

				const data = await res.json();
				return data.exists ?
					"found" : "not_found";
			}
			catch (err)
			{
				console.error("Checker Error:", err);
				return "unknown";
			}
		}

		// For sources with check_type "html_alt": fetch the page HTML and
		// look for an img whose alt attribute matches the expected string.
		async function check_html_alt({ url, alt })
		{
			try {
				const queryString = `?url=${url}&alt=${encodeURIComponent(alt)}`;

				const res = await fetch(`${PROXY}/check-html${queryString}`, {
					signal: AbortSignal.timeout(20000)
				});

				if (!res.ok) return "not_found";

				const data = await res.json();
				return data.exists ? "found" : "not_found";
			}
			catch (err)
			{
				console.error("Checker (html_alt) Error:", err);
				return "unknown";
			}
		}

		function check_each(source_url_map, on_result)
		{
			for (const [name, val] of Object.entries(source_url_map))
			{
                // always_found = Flame Comics (can't check chapter URLs)
                if (val?.type === "always_found")
                {
                    on_result(name, "found");
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