const Modal = (() => {

	// Both maps are populated from sources.json via Modal.init()
	let SOURCE_MAP    = {}; // { "Asura Scans": ASURASCANS, ... }
	let PAYWALL_NOTES = {}; // { "Thunder Scans": "note...", ... }
	let PAYWALL_SOURCES = new Set();

	let _on_visit    = null;
	let _was_visited = null;

	let _manga   = null;
	let _chapter = null;

	const modal     = document.getElementById("modal");
	const ch_lbl    = document.getElementById("modal_chapter_label");
	const title     = document.getElementById("modal_title");
	const body      = document.getElementById("modal_body");
	const close_btn = document.getElementById("close_modal");

	function init({ on_visit, was_visited, sources }) {
		_on_visit    = on_visit;
		_was_visited = was_visited;

		// Build SOURCE_MAP and PAYWALL maps from sources.json data
		// `sources` is the parsed array passed in from app.js after fetching sources.json
		const GLOBAL_OBJECTS = { ASURASCANS, ADKSCANS, THUNDERSCANS, TEMPLESCANS,
		                          DEMONICSCANS, FLAMESCANS, VIOLETSCANS, MANGAPLUS };
		SOURCE_MAP    = {};
		PAYWALL_NOTES = {};
		for (const s of (sources || [])) {
			if (GLOBAL_OBJECTS[s.object]) SOURCE_MAP[s.name] = GLOBAL_OBJECTS[s.object];
			if (s.paywall_note)           PAYWALL_NOTES[s.name] = s.paywall_note;
		}
		PAYWALL_SOURCES = new Set(Object.keys(PAYWALL_NOTES));
	}

	function open(manga, chapter) {
		_manga   = manga;
		_chapter = chapter;
		ch_lbl.textContent = chapter.chapter ? `Chapter ${chapter.chapter}` : "Oneshot";
		title.textContent  = manga.title;
		modal.classList.add("open");
		render();
	}

	function close() {
		modal.classList.remove("open");
		_manga = _chapter = null;
	}

	function _sectioned_sources(manga) {
		const all = (manga.sources || []).map(n => SOURCE_MAP[n]).filter(Boolean);
		return {
			official:    all.filter(s => s.type === "official"),
			scanlators:  all.filter(s => s.type === "fantl"),
			aggregators: all.filter(s => s.type === "aggr"),
		};
	}

	function _ordered_sections(sections, has_adblock) {
		const order = ["official", "scanlators", "aggregators"];
		return order
			.map(key => ({ key, sources: sections[key], has_adblock }))
			.filter(s => s.sources.length > 0)
			.filter(s => !(has_adblock && s.key === "scanlators"));
	}

	async function render() {
		const manga   = _manga;
		const chapter = _chapter;
		if (!manga || !chapter) return;

		const sections    = _sectioned_sources(manga);
		const has_adblock = await AdBlock.has_adblock();
		const ordered     = _ordered_sections(sections, has_adblock);
		const all_sources = ordered.flatMap(s => s.sources);

		if (all_sources.length === 0) {
			body.innerHTML = `<div class="empty_state"><p>No known sources for this title.</p></div>`
				+ google_section(manga, chapter);
			return;
		}

		const SECTION_LABELS = {
			official:    "Official",
			scanlators:  "Scanlators",
			aggregators: "Aggregators",
		};

		const show_section_headers = ordered.length > 1;

		body.innerHTML = ordered.map(({ key, sources }) => {
			const header = show_section_headers
				? `<div class="source_section_header src_section_${key}">${SECTION_LABELS[key]}</div>`
				: "";
			const cards = sources.map(src => {
				const locked = src.is_chapter_locked ? src.is_chapter_locked(chapter) : false;
				return build_card(src, manga, chapter, locked ? "locked" : "checking",
					_was_visited(manga.id, chapter.chapter, src.name));
			}).join("");
			return `<div class="source_section" data-section="${key}">${header}${cards}</div>`;
		}).join("") + google_section(manga, chapter);

		bind_link_tracking(manga, chapter);

		const url_map = {};
		all_sources.forEach(src => {
			const locked = src.is_chapter_locked ? src.is_chapter_locked(chapter) : false;
			if (locked) {
				url_map[src.name] = { type: "always_found", locked: true };
				return;
			}
			const check_type = src.get_check_type ? src.get_check_type(manga, chapter) : src.check_type;
			if (check_type === "always_found") {
				url_map[src.name] = { type: "always_found" };
			} else if (check_type === "html_alt") {
				url_map[src.name] = {
					type: "html_alt",
					url:  src.get_check_url ? src.get_check_url(manga, chapter) : src.chapter_url(manga, chapter),
					alt:  src.get_alt_text(manga, chapter),
				};
			} else if (src.get_test_urls) {
				url_map[src.name] = src.get_test_urls(manga, chapter);
			} else {
				url_map[src.name] = [src.chapter_url(manga, chapter)];
			}
		});

		Checker.check_each(url_map, (name, status) => {
			if (_manga?.id !== manga.id || _chapter?.chapter !== chapter.chapter) return;

			const src = all_sources.find(s => s.name === name);
			if (!src) return;

			const card = body.querySelector(`a.source_item[data-site="${CSS.escape(name)}"]`);
			if (!card) return;

			if (card.dataset.locked === "1") return;

			const old_badge = card.querySelector(".check_badge, .found_badge");
			if (old_badge) old_badge.replaceWith(make_badge(status));

			card.classList.remove("checking", "not_found");
			if (status === "not_found") card.classList.add("not_found");
			if (status === "found") {
				const section = card.closest(".source_section");
				const header  = section?.querySelector(".source_section_header");
				if (header) header.after(card);
				else section?.prepend(card);
			}
		});
	}

	function build_card(src, manga, chapter, availability, visited) {
		const url     = src.chapter_url(manga, chapter);
		const locked  = availability === "locked";

		const note_for_user = PAYWALL_SOURCES.has(src.name)
			? `<span class="paywall_note">${PAYWALL_NOTES[src.name]}</span>`
			: "";

		const badge_html = {
			checking:  `<span class="check_badge">checking...</span>`,
			found:     `<span class="found_badge">available</span>`,
			not_found: `<span class="check_badge">not found</span>`,
			browse:    `<span class="browse_badge">browse</span>`,
			locked:    `<span class="locked_badge">members only</span>`,
		}[availability] ?? "";

		const visited_html = visited ? `<span class="visited_badge">visited</span>` : "";
		const extra_class  = availability === "not_found" ? " not_found"
			: availability === "checking" ? " checking"
			: availability === "locked"   ? " locked_chapter"
			: "";

		let acronym = src.name.split(" ").map(w => w[0]).join("").substring(0, 2).toUpperCase();
		if (acronym.length < 2) acronym = src.name.substring(0, 2).toUpperCase();

		const type_class = src.type === "official" ? "src_official"
			: src.type === "aggr" ? "src_aggr"
			: "src_fantl";

		return `
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         class="source_item${visited ? " visited" : ""}${extra_class}"
         data-site="${src.name}"
         data-ch="${UI.escape_html(chapter.chapter || "oneshot")}"
         data-locked="${locked ? "1" : "0"}">
        <div class="source_icon_wrap ${type_class}_wrap">
          <div class="source_icon text_icon">${acronym}</div>
          <span class="src_type_dot ${type_class}"></span>
        </div>
        <div class="source_info">
          <div class="source_name">${src.name}${note_for_user}</div>
          <div class="source_badges">
            ${visited_html}
            ${badge_html}
          </div>
        </div>
      </a>`;
	}

	function make_badge(availability) {
		if (availability === "checking")  return Object.assign(document.createElement("span"), { className: "check_badge",  textContent: "checking..."  });
		if (availability === "found")     return Object.assign(document.createElement("span"), { className: "found_badge",  textContent: "available"    });
		if (availability === "not_found") return Object.assign(document.createElement("span"), { className: "check_badge",  textContent: "not found"    });
		if (availability === "browse")    return Object.assign(document.createElement("span"), { className: "browse_badge", textContent: "browse"       });
		if (availability === "locked")    return Object.assign(document.createElement("span"), { className: "locked_badge", textContent: "members only" });
		return document.createElement("span");
	}

	function google_section(manga, chapter) {
		const q = encodeURIComponent(`${manga.title} chapter ${chapter.chapter || 1} read online`);
		return `<div class="google_section">
      <a href="https://www.google.com/search?q=${q}" target="_blank" class="ext_link">Google search</a>
    </div>`;
	}

	function bind_link_tracking(manga, chapter) {
		body.querySelectorAll("a.source_item[data-site]").forEach(link => {
			link.addEventListener("click", () => {
				const site = link.dataset.site;
				const ch   = link.dataset.ch;
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

	if (close_btn) close_btn.addEventListener("click", close);
	if (modal) {
		modal.addEventListener("click", e => { if (e.target === modal) close(); });
		document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
	}

	function refresh_if_open() {
		if (_manga && _chapter && modal.classList.contains("open")) render();
	}

	return { init, open, close, refresh_if_open };

})();
