/*
 * checker.js
 *
 * Verifies whether a chapter URL actually exists on a source site.
 *
 * Because manga sites do not set CORS headers, the browser cannot fetch
 * them directly. Instead, every request is routed through a public CORS
 * proxy. Two proxies are tried in order -- if the first one fails or
 * times out, the second one is attempted.
 *
 * Proxy list (tried top to bottom):
 *   corsproxy.io  -- preferred, has server-side caching
 *   corsfix.com   -- fallback
 *
 * Check types used by source modules:
 *   (default)     -- HEAD/GET the chapter URL, look for HTTP 200 + correct content-type
 *   "html_alt"    -- fetch the page HTML and scan for a specific img alt attribute
 *                    (used when chapter pages return 403 to bots, e.g. Temple Toons)
 *   "always_found"-- skip the network check entirely and mark as "browse"
 *                    (used when chapter URLs contain unguessable hex segments, e.g. Flame Comics)
 */

const Checker = (() => {

	// Each entry is a function that takes a target URL and returns the proxied URL.
	const PROXIES = [
		url => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
		url => `https://proxy.corsfix.com/?${url}`,
	];

	// How long to wait for a single proxy request before giving up and trying the next one.
	const TIMEOUT_MS = 8000;

	// Internal: send a request through each proxy in order.
	// Returns the first successful Response object, or null if every proxy failed.
	async function _fetch_proxied(url) {
		for (const make_url of PROXIES) {
			try {
				const res = await fetch(make_url(url), {
					signal: AbortSignal.timeout(TIMEOUT_MS),
				});
				// A 404 from the proxy means the origin actually 404'd -- no point trying more proxies.
				if (res.status === 404) return res;
				if (res.ok) return res;
			} catch {
				// This proxy failed or timed out -- try the next one.
			}
		}
		return null;
	}

	// Check a list of candidate URLs in order.
	// Tries each URL until one is confirmed to exist.
	// Returns "found", "not_found", or "not_found" on total failure.
	async function check_url(url_array) {
		for (const url of url_array) {
			try {
				const res = await _fetch_proxied(url);
				if (!res) continue;

				// An explicit 404 from the origin means the chapter does not exist.
				if (res.status === 404) return "not_found";

				// For image URLs, confirm the response has an image content-type.
				// For HTML pages, confirm we got a text/html response.
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

	// Alternative check: fetch an HTML page and look for a specific img alt attribute.
	// Used for sources where the chapter URL returns 403 but the series page does not.
	// The alt text uniquely identifies the chapter (e.g. "Chapter 21").
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
	 * Run existence checks for all sources, firing them all in parallel.
	 * Calls on_result(source_name, status) as each check resolves.
	 *
	 * source_url_map shape:
	 *   { [source_name]: string[] }                        -- URL list, use check_url
	 *   { [source_name]: { type: "html_alt", url, alt } }  -- use check_html_alt
	 *   { [source_name]: { type: "always_found" } }        -- skip check, mark as "browse"
	 */
	function check_each(source_url_map, on_result) {
		for (const [name, val] of Object.entries(source_url_map)) {

			// Sources like Flame Comics have unguessable chapter URLs, so we skip
			// the network check and just show a "browse" badge instead.
			if (val?.type === "always_found") {
				on_result(name, "browse");
				continue;
			}

			const promise = val?.type === "html_alt"
				? check_html_alt(val)
				: check_url(val);

			// On unexpected errors, fall back to "not_found" rather than leaving
			// the card stuck on "checking..." forever.
			promise
				.then(status => on_result(name, status))
				.catch(() => on_result(name, "not_found"));
		}
	}

	return { check_url, check_each };
})();
