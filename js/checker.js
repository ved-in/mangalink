/*
 * Checker — verifies whether a chapter URL actually exists.
 *
 * We no longer run a dedicated proxy server. All checks go through
 * public CORS proxies, tried in order until one succeeds.
 *
 * Proxy notes:
 *   corsproxy.io  — best option, has server-side caching
 *   corsfix.com   — good fallback
 *
 * Both hit rate limits under heavy use, but that's acceptable since
 * checks are user-triggered and infrequent.
 */

const Checker = (() => {

	const PROXIES = [
		url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
		url => `https://proxy.corsfix.com/?${url}`,
	];

	const TIMEOUT_MS = 8000;

	// Fetch a URL through each proxy in order.
	// Returns the first successful Response, or null if all fail.
	async function _fetch_proxied(url) {
		for (const make_url of PROXIES) {
			try {
				const res = await fetch(make_url(url), {
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});
				// 404 from the proxy means the origin actually 404'd — stop trying.
				if (res.status === 404) return res;
				if (res.ok) return res;
			} catch {
				// This proxy failed or timed out — try the next one.
			}
		}
		return null;
	}

	// Check one or more candidate URLs (tried in order).
	// Returns "found" | "not_found" | "unknown".
	async function check_url(url_array) {
		for (const url of url_array) {
			try {
				const res = await _fetch_proxied(url);
				if (!res) continue;

				// Explicit 404 from origin = chapter doesn't exist.
				if (res.status === 404) return "not_found";

				const content_type = res.headers.get("content-type") || "";
				const is_image = /\.(webp|jpg|jpeg|png)$/i.test(url);
				const exists = is_image
					? content_type.includes("image")
					: res.ok && content_type.includes("text/html");

				if (exists) return "found";
			} catch {
				// Try next URL.
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

	/*
	 * Run checks for all sources in parallel, calling on_result(name, status)
	 * as each one resolves.
	 *
	 * source_url_map shape:
	 *   { [source_name]: string[]                  }  — URL list (check_url)
	 *   { [source_name]: { type: "html_alt", url, alt } }
	 *   { [source_name]: { type: "always_found" }  }  — e.g. Flame Comics
	 */
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
