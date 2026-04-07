const SourcesRegistry = (() => {
	// TESTED (2026-04-07):
	// - node --check passed for this file.
	// - Asura/ADK/Demonic URL generation paths validated for multi-title candidate flow.
	// - Accuracy depends on source-side slug conventions; keep manual spot checks when adding sources.

	function unique_non_empty(values) {
		const out = [];
		const seen = new Set();
		for (const v of values || []) {
			const trimmed = String(v || "").trim();
			if (!trimmed) continue;
			const key = trimmed.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			out.push(trimmed);
		}
		return out;
	}

	function normalize_words(title) {
		return String(title || "")
			.replace(/\([^)]*\)/g, " ")
			.replace(/[^a-zA-Z0-9\s-]/g, " ")
			.replace(/\s+/g, " ")
			.trim();
	}

	function basic_slug(title) {
		return normalize_words(title)
			.toLowerCase()
			.replace(/\s+/g, "-")
			.replace(/-+/g, "-");
	}

	function demonic_web_slug(title) {
		return String(title || "")
			.trim()
			.replace(/-/g, "%25252D")
			.replace(/:/g, "%253A")
			.replace(/\s+/g, "-")
			.replace(/[^a-zA-Z0-9\-%]/g, "");
	}

	function title_candidates(manga) {
		const raw = unique_non_empty([
			manga?.title,
			...(manga?.title_candidates || []),
		]);
		const variants = [];
		for (const t of raw) {
			variants.push(t);
			variants.push(t.replace(/[:\-]\s*[^:.\-]+$/g, "").trim());
		}
		return unique_non_empty(variants).slice(0, 8);
	}

	function fill_template(template, { slug, chapter, query }) {
		return String(template || "")
			.replace(/\{slug\}/g, slug || "")
			.replace(/\{chapter\}/g, chapter || "")
			.replace(/\{query\}/g, encodeURIComponent(query || ""));
	}

	function create_templated_source(def) {
		return {
			id: def.id,
			name: def.name,
			icon: def.icon,
			type: def.type,
			priority: def.priority || 999,
			check_enabled: true,

			_primary_slug(manga) {
				const first = title_candidates(manga)[0] || manga.title || "";
				return basic_slug(first);
			},

			_slugs(manga) {
				return unique_non_empty(title_candidates(manga).map(basic_slug));
			},

			series_url(manga) {
				return fill_template(def.series_template, {
					slug: this._primary_slug(manga),
				});
			},

			chapter_url(manga, chapter) {
				if (!chapter.chapter) return this.series_url(manga);
				return fill_template(def.chapter_template, {
					slug: this._primary_slug(manga),
					chapter: chapter.chapter,
				});
			},

			get_test_urls(manga, chapter) {
				if (!chapter.chapter) return [this.series_url(manga)];
				const urls = [];
				for (const slug of this._slugs(manga)) {
					urls.push(fill_template(def.chapter_template, {
						slug,
						chapter: chapter.chapter,
					}));
				}
				return unique_non_empty(urls);
			},
		};
	}

	function create_demonic_source(def) {
		return {
			id: def.id,
			name: def.name,
			icon: def.icon,
			type: def.type,
			priority: def.priority || 999,
			check_enabled: true,

			_web_slug(manga) {
				const first = title_candidates(manga)[0] || manga.title || "";
				return demonic_web_slug(first);
			},

			_web_slugs(manga) {
				return unique_non_empty(title_candidates(manga).map(demonic_web_slug));
			},

			series_url(manga) {
				return `https://demonicscans.org/manga/${this._web_slug(manga)}`;
			},

			chapter_url(manga, chapter) {
				if (!chapter.chapter) return this.series_url(manga);
				return `https://demonicscans.org/title/${this._web_slug(manga)}/chapter/${chapter.chapter}/1`;
			},

			get_test_urls(manga, chapter) {
				if (!chapter.chapter) return [this.series_url(manga)];
				return this._web_slugs(manga).map(
					slug => `https://demonicscans.org/title/${slug}/chapter/${chapter.chapter}/1`
				);
			},
		};
	}

	function create_search_source(def) {
		return {
			id: def.id,
			name: def.name,
			icon: def.icon,
			type: def.type,
			priority: def.priority || 999,
			check_enabled: false,

			series_url(manga) {
				return fill_template(def.search_template, { query: manga.title || "" });
			},

			chapter_url(manga) {
				return this.series_url(manga);
			},

			get_test_urls() {
				return [];
			},
		};
	}

	function build_source(def) {
		if (def.mode === "demonic") return create_demonic_source(def);
		if (def.mode === "search_only") return create_search_source(def);
		return create_templated_source(def);
	}

	function get_all() {
		const defs = Array.isArray(window.SOURCE_CATALOG) ? window.SOURCE_CATALOG : [];
		return defs.map(build_source).sort((a, b) => (a.priority || 999) - (b.priority || 999));
	}

	return { get_all };
})();
