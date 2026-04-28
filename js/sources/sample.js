// Template for adding a new source. Copy this file, rename the const,
// and fill in the site-specific details.
//
// Available helpers (from utils.js):
//   slugify(title)          - lowercases, strips special chars, spaces → hyphens
//   url_last_segment(url)   - extracts the last path segment from a URL
//
// check_type options:
//   (omit)          - plain HEAD/GET request against chapter_url
//   "html_alt"      - fetch a page and look for an <img alt="..."> match
//   "always_found"  - skip check entirely (e.g. when URLs are unguessable)

var SampleSource = {
	name: "Site Name",
	icon: "🌐",
	type: "fantl",

	// check_type: "html_alt",

	// get_alt_text(manga, chapter) {
	//   return `${manga.title} Chapter ${chapter.chapter} 1`;
	// },

	series_url(manga) {
		return manga.sources?.["Site Name"]
			?? `https://example.com/manga/${slugify(manga.title)}`;
	},

	chapter_url(manga, chapter) {
		if (!chapter.chapter) return this.series_url(manga);
		return `${this.series_url(manga)}/chapter/${chapter.chapter}`;
	},

	// get_test_urls(manga, chapter) {
	//   const slug = slugify(manga.title);
	//   return [
	//     `https://cdn.example.com/${slug}/${chapter.chapter}/1.jpg`,
	//     `https://cdn.example.com/${slug}/${chapter.chapter}/1.webp`,
	//   ];
	// },
};
