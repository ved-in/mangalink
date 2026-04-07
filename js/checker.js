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
			window.location.hostname === "localhost"
				? "http://localhost:3000"
				: "https://your-app.onrender.com";

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

		async function check_all(source_url_map)
		{
			const entries = Object.entries(source_url_map);
			const results = await Promise.all(entries.map(([, urls]) => check_url(urls)));

			const out = {};
			entries.forEach(([name], i) => { out[name] = results[i]; });
			return out;
		}

		return { check_url, check_all };
	}
)();