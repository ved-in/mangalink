function slugify(title) {
	return title
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.replace(/-+/g, "-");
}

function url_last_segment(url) {
	return url.replace(/\/$/, "").split("/").pop();
}
