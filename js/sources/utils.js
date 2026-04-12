/*
 * Shared utilities for source modules.
 * Each source used to copy-paste the same _to_slug() — now they just call slugify().
 */

/**
 * Convert a manga title to a URL-safe slug.
 * e.g. "Solo Leveling: Ragnarok!" → "solo-leveling-ragnarok"
 */
function slugify(title) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

/**
 * Extract the last path segment from a URL, stripping a trailing slash.
 * e.g. "https://example.com/comics/some-title/" → "some-title"
 */
function url_last_segment(url) {
	return url.replace(/\/$/, "").split("/").pop();
}
