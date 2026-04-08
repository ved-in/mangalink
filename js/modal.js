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

	const ALL_SOURCES = [ASURASCANS, DEMONICSCANS, ADKSCANS, THUNDERSCANS];

	let _on_visit = null;
	let _was_visited = null;
	let _manga = null;
	let _chapter = null;

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

		body.innerHTML = ALL_SOURCES.map(
			src =>
			build_card(src, manga, chapter, "checking", _was_visited(manga.id, chapter.chapter, src.name))
		).join("") + google_section(manga, chapter);

		bind_link_tracking(manga, chapter);

		const url_map = {};
		ALL_SOURCES.forEach(src => {
			if (src.check_type === "html_alt")
			{
				url_map[src.name] = {
					type: "html_alt",
					url: src.chapter_url(manga, chapter),
					alt: src.get_alt_text(manga, chapter),
				};
			}
			else if (src.get_test_urls) {
				url_map[src.name] = src.get_test_urls(manga, chapter);
			}
			else {
				url_map[src.name] = [src.chapter_url(manga, chapter)];
			}
		});

		Checker.check_each(url_map, (name, status) => {
			// if modal closed or chapter changed
			if (_manga?.id !== manga.id || _chapter?.chapter !== chapter.chapter) return;

			const src = ALL_SOURCES.find(s => s.name === name);
			if (!src) return;

			const card = body.querySelector(`a.source_item[data-site="${CSS.escape(name)}"]`);
			if (!card) return;

			const old_badge = card.querySelector(".check_badge, .found_badge");
			if (old_badge) old_badge.replaceWith(make_badge(status));

			card.classList.remove("checking", "not_found");
			if (status === "not_found") card.classList.add("not_found");
			if (status === "found") body.prepend(card);
		});
	}

	function build_card(src, manga, chapter, availability, visited) {
		const url = src.chapter_url(manga, chapter);
		const badge_html = {
			checking:  `<span class="check_badge">checking…</span>`,
			found:     `<span class="found_badge">✓ available</span>`,
			not_found: `<span class="check_badge">not found</span>`,
		}[availability] ?? "";
		const visited_html = visited ? `<span class="visited_badge">✓ visited</span>` : "";
		const extra_class = availability === "not_found" ? " not_found" : availability === "checking" ? " checking" : "";

		return `
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         class="source_item${visited ? " visited" : ""}${extra_class}"
         data-site="${src.name}" data-ch="${UI.escape_html(chapter.chapter || "oneshot")}">
        <div class="source_left">
          <div class="source_icon">${src.icon}</div>
          <div class="source_name">${src.name}</div>
        </div>
        <div class="source_right">
          ${visited_html}
          ${badge_html}
          <span style="color:var(--muted);font-size:0.8rem;">→</span>
        </div>
      </a>`;
	}

	function make_badge(availability) {
		if (availability === "checking") return Object.assign(document.createElement("span"), { className: "check_badge",  textContent: "checking…"    });
		if (availability === "found")    return Object.assign(document.createElement("span"), { className: "found_badge",  textContent: "✓ available"   });
		if (availability === "not_found") return Object.assign(document.createElement("span"), { className: "check_badge", textContent: "not found"     });
		return document.createElement("span");
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
						right.insertAdjacentHTML("afterbegin", `<span class="visited_badge">✓ visited</span>`);
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