/*
 * utils.js
 *
 * Shared utility functions used by every source module.
 * Must be loaded before any source file in index.html.
 *
 * Previously each source copy-pasted its own version of slugify().
 * Centralising it here means a single fix covers all sources.
 */

// Convert a manga title into a URL-safe slug.
// Strips everything except lowercase letters, digits, spaces, and hyphens,
// then replaces spaces with hyphens and collapses consecutive hyphens.
//
// Example:  "Solo Leveling: Ragnarok!"  ->  "solo-leveling-ragnarok"
function slugify(title) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")   // strip special characters
		.trim()
		.replace(/\s+/g, "-")            // spaces to hyphens
		.replace(/-+/g, "-");            // collapse consecutive hyphens
}

// Extract the last path segment from a URL, ignoring a trailing slash.
// Used by source modules to pull the series slug out of a stored URL.
//
// Example:  "https://example.com/comics/some-title/"  ->  "some-title"
function url_last_segment(url) {
	return url.replace(/\/$/, "").split("/").pop();
}
