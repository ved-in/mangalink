/*
Shows u options of where u can read them

Shows u list of scanlations where u can read the particular series.
it checks whether the chapter exists (sometimes it doesnt) and tells u where it exists, where it doesnt.

Subject to error
CUZ THIS FUCKING DEMONICSCANS HAS SOOO MANY IMAGE LINKS AHHHHHH
but you DEFINITELY will not miss a chapter which is in asurascans..

Also shows u a Google It option.
*/

const Modal = (() => {
	// TESTED (2026-04-07):
	// - node --check passed for this file.
	// - Verified logic for progressive source-state rendering + live sorting (found -> top).
	// - Manual browser QA still needed for final UI/interaction confirmation.

	const ALL_SOURCES = SourcesRegistry.get_all();

	let _on_visit = null;
	let _was_visited = null;
	let _manga = null;
	let _chapter = null;
	let _run_id = 0;

	const modal = document.getElementById("modal");
	const ch_lbl = document.getElementById("modal_chapter_label");
	const title = document.getElementById("modal_title");
	const body = document.getElementById("modal_body");
	const close_btn = document.getElementById("close_modal");

	function init({ on_visit, was_visited }) {
		_on_visit = on_visit;
		_was_visited = was_visited;
	}

	function open(manga, chapter) {
		_manga = manga;
		_chapter = chapter;
		ch_lbl.textContent = chapter.chapter ?
			`Chapter ${chapter.chapter}` : "Oneshot";
		title.textContent = manga.title;
		modal.classList.add("open");
		render();
	}

	function close() {
		modal.classList.remove("open");
		_manga = _chapter = null;
	}

	async function render() {
		const manga = _manga;
		const chapter = _chapter;
		if (!manga || !chapter) return;
		const run_id = ++_run_id;

		const states = {};
		for (const src of ALL_SOURCES) {
			const visited = _was_visited(manga.id, chapter.chapter, src.name);
			if (src.check_enabled === false) {
				states[src.name] = {
					availability: "manual",
					resolved_url: src.chapter_url(manga, chapter),
					visited,
				};
			} else {
				states[src.name] = {
					availability: "checking",
					resolved_url: null,
					visited,
				};
			}
		}

		render_states(manga, chapter, states);

		const url_map = {};
		ALL_SOURCES.forEach(src => {
			if (src.check_enabled === false) return;
			const testUrls = src.get_test_urls
				? src.get_test_urls(manga, chapter)
				: [src.chapter_url(manga, chapter)];
			url_map[src.name] = testUrls;
		});

		await Checker.check_progressive(url_map, {
			concurrency: 4,
			on_update: (source_name, result) => {
				if (run_id !== _run_id) return;
				if (!states[source_name]) return;
				states[source_name].availability = result.availability || "unknown";
				states[source_name].resolved_url = result.url || null;
				render_states(manga, chapter, states);
			},
		});
	}

	function sort_sources_with_states(states) {
		const rank = { found: 0, manual: 1, checking: 2, unknown: 3, not_found: 4 };
		return ALL_SOURCES.slice().sort((a, b) => {
			const a_state = states[a.name]?.availability || "unknown";
			const b_state = states[b.name]?.availability || "unknown";
			const by_rank = (rank[a_state] ?? 9) - (rank[b_state] ?? 9);
			if (by_rank !== 0) return by_rank;
			return (a.priority || 999) - (b.priority || 999);
		});
	}

	function render_states(manga, chapter, states) {
		const sorted = sort_sources_with_states(states);
		body.innerHTML = sorted.map(src => {
			const state = states[src.name] || { availability: "unknown", visited: false, resolved_url: null };
			return build_card(src, manga, chapter, state.availability, state.visited, state.resolved_url);
		}).join("") + google_section(manga, chapter);
		bind_link_tracking(manga, chapter);
	}

	function build_card(src, manga, chapter, availability, visited, resolved_url = null) {
		const url = resolved_url || src.chapter_url(manga, chapter);
		const avail_badge = badge_for(availability);
		const visited_html = visited ? `<span class="visited_badge">visited</span>` : "";
		const extra_class = availability === "not_found" ? " not_found" : availability === "checking" ? " checking" : availability === "manual" ? " manual" : "";
		const is_clickable = availability !== "checking" && availability !== "not_found";
		const tag = is_clickable ? "a" : "div";
		const href_attr = is_clickable ? `href="${url}" target="_blank" rel="noopener noreferrer"` : "";

		return `
      <${tag} ${href_attr}
         class="source_item${visited ? " visited" : ""}${extra_class}"
         data-site="${src.name}" data-ch="${UI.escape_html(chapter.chapter || "oneshot")}">
        <div class="source_left">
          <div class="source_icon">${src.icon}</div>
          <div class="source_name">${src.name}</div>
        </div>
        <div class="source_right">
          ${visited_html}
          ${avail_badge}
          <span style="color:var(--muted);font-size:0.8rem;">→</span>
        </div>
      </${tag}>`;
	}

	function badge_for(availability) {
		if (availability === "checking") return `<span class="check_badge"><span class="mini_spinner"></span> checking…</span>`;
		if (availability === "found")    return `<span class="found_badge">available</span>`;
		if (availability === "manual") return `<span class="check_badge">search</span>`;
		if (availability === "not_found") return `<span class="check_badge">not found</span>`;
		return "";
	}

	function google_section(manga, chapter) {
		const q = encodeURIComponent(`${manga.title} chapter ${chapter.chapter || 1} read online`);
		return `<div class="google_section">
      <a href="https://www.google.com/search?q=${q}" target="_blank" class="ext_link">🔍 Google search →</a>
    </div>`;
	}

	function bind_link_tracking(manga, chapter) {
		body.querySelectorAll("a.source_item[data-site]").forEach(link => {
			link.addEventListener("click", () => {
				const site = link.dataset.site;
				const ch = link.dataset.ch;
				if (site && ch) {
					_on_visit(manga.id, ch, site);
					link.classList.add("visited");
					const right = link.querySelector(".source_right");
					if (right && !right.querySelector(".visited_badge")) {
						right.insertAdjacentHTML("afterbegin", `<span class="visited_badge">visited</span>`);
					}
				}
			});
		});
	}

	close_btn.addEventListener("click", close);
	modal.addEventListener("click", e => { if (e.target === modal) close(); });
	document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

	return { init, open, close };

})();
