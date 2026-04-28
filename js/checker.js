const Checker = (() => {

	const PROXIES = [
		url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
		url => `https://proxy.corsfix.com/?${url}`,
	];

	const TIMEOUT_MS = 8000;

	async function _fetch_proxied(url) {
		for (const make_url of PROXIES) {
			try {
				const res = await fetch(make_url(url), {
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});
				if (res.status === 404) return res;
				if (res.ok) return res;
			} catch {
				// try next proxy
			}
		}
		return null;
	}

	async function check_url(url_array) {
		for (const url of url_array) {
			try {
				const res = await _fetch_proxied(url);
				if (!res) continue;

				if (res.status === 404) return "not_found";

				const content_type = res.headers.get("content-type") || "";
				const is_image = /\.(webp|jpg|jpeg|png)$/i.test(url);
				const exists = is_image
					? content_type.includes("image")
					: res.ok && content_type.includes("text/html");

				if (exists) return "found";
			} catch {
				// try next URL
			}
		}
		return "not_found";
	}

	async function check_html_alt({ url, alt })
	{
		try
		{
			const res = await _fetch_proxied(url);
			if (!res) return "not_found";

			const html = await res.text();
			return html.includes(`alt="${alt}"`) ? "found" : "not_found";
		}
		catch (_) { return "not_found"; }
	}

	function check_each(source_url_map, on_result) {
		for (const [name, val] of Object.entries(source_url_map)) {

			if (val?.type === "always_found") {
				on_result(name, "browse");
				continue;
			}

			const promise = val?.type === "html_alt"
				? check_html_alt(val)
				: check_url(val);

			promise
				.then(status => on_result(name, status))
				.catch(() => on_result(name, "not_found"));
		}
	}

	return { check_url, check_each };
})();
