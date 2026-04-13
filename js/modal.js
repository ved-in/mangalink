/*
 * modal.js
 *
 * The "Sources" modal that appears when a user clicks a chapter.
 *
 * WHAT IT DOES:
 *   1. Shows a card for each source that carries this series.
 *   2. Starts availability checks in parallel via Checker.
 *   3. Updates each card's badge (checking -> found / not_found / browse) as results arrive.
 *   4. Moves "found" cards to the top of the list.
 *   5. Tracks which links the user has clicked and shows a "visited" badge.
 *   6. Always appends a Google fallback link at the bottom.
 *
 * CHECK TYPES (defined per source module):
 *   (default)     -- HEAD request to the chapter URL, pass if HTTP 200 + correct content-type
 *   "html_alt"    -- fetch a page and scan for a specific img alt= attribute
 *                    (Demonic Scans and Temple Toons -- chapter pages block bots)
 *   "always_found"-- skip check, show "browse" badge instead
 *                    (Flame Comics -- chapter URLs contain unguessable hex tokens)
 *
 * PAYWALL NOTE:
 *   Thunder Scans and Violet Scans lock some chapters behind a paywall.
 *   A small warning label is shown on their cards.
 */

const Modal = (() => {

	// Maps source name strings to their source module objects.
	// Filtered per-manga so only relevant sources appear.
	const SOURCE_MAP = {
		"Asura Scans":   ASURASCANS,
		"ADK Scans":     ADKSCANS,
		"Thunder Scans": THUNDERSCANS,
		"Temple Toons":  TEMPLESCANS,
		"Demonic Scans": DEMONICSCANS,
		"Flame Comics":  FLAMESCANS,
		"Violet Scans":  VIOLETSCANS,
	};
	

	// Sources that lock some chapters behind a subscription.
	const PAYWALL_SOURCES = new Set(["Thunder Scans", "Violet Scans"]);

	// Callbacks injected by App.init() via Modal.init().
	let _on_visit    = null;
	let _was_visited = null;

	// The manga and chapter currently shown in the modal.
	// Checked in Checker callbacks to discard stale results if the user
	// closes and reopens the modal before all checks finish.
	let _manga   = null;
	let _chapter = null;

	// Grab DOM elements once -- the modal is a singleton that stays in the DOM.
	const modal    = document.getElementById("modal");
	const ch_lbl   = document.getElementById("modal_chapter_label");
	const title    = document.getElementById("modal_title");
	const body     = document.getElementById("modal_body");
	const close_btn = document.getElementById("close_modal");

	// Called by App.init() to inject the visit tracking callbacks.
	function init({ on_visit, was_visited }) {
		_on_visit    = on_visit;
		_was_visited = was_visited;
	}

	// Open the modal for a given manga + chapter and start availability checks.
	function open(manga, chapter) {
		_manga   = manga;
		_chapter = chapter;
		ch_lbl.textContent = chapter.chapter ? `Chapter ${chapter.chapter}` : "Oneshot";
		title.textContent  = manga.title;
		modal.classList.add("open");
		render();
	}

	// Close the modal and clear state.
	function close() {
		modal.classList.remove("open");
		_manga = _chapter = null;
	}

	// Return source module objects for sources that this manga is actually on.
	// manga.sources is an array of name strings (e.g. ["Asura Scans", "ADK Scans"]).
	function _active_sources(manga)
	{
		return (manga.sources || [])
			.map(n => SOURCE_MAP[n])
			.filter(Boolean);
	}

	// Build the modal body and kick off all availability checks.
	async function render() {
		const manga   = _manga;
		const chapter = _chapter;
		if (!manga || !chapter) return;

		const sources = _active_sources(manga);

		if (sources.length === 0)
		{
			body.innerHTML = `<div class="empty_state"><p>No known sources for this title.</p></div>`
				+ google_section(manga, chapter);
			return;
		}

		// Render all source cards immediately in "checking" state.
		body.innerHTML = sources.map(
			src => build_card(src, manga, chapter, "checking", _was_visited(manga.id, chapter.chapter, src.name))
		).join("") + google_section(manga, chapter);

		// Attach visit-tracking click handlers before checks complete.
		bind_link_tracking(manga, chapter);

		// Build the URL map that Checker needs for each source.
		const url_map = {};
		sources.forEach(src => {
			const check_type = src.get_check_type ? src.get_check_type(manga, chapter) : src.check_type;
			if (check_type === "always_found")
			{
				// Skip network check entirely for sources with unguessable URLs.
				url_map[src.name] = { type: "always_found" };
			}
			else if (check_type === "html_alt")
			{
				// Fetch a page and scan for an img alt attribute.
				url_map[src.name] = {
					type: "html_alt",
					url:  src.get_check_url ? src.get_check_url(manga, chapter) : src.chapter_url(manga, chapter),
					alt:  src.get_alt_text(manga, chapter),
				};
			}
			else if (src.get_test_urls)
			{
				// Source provides multiple candidate URLs to try in order.
				url_map[src.name] = src.get_test_urls(manga, chapter);
			}
			else
			{
				// Standard case: check the direct chapter URL.
				url_map[src.name] = [src.chapter_url(manga, chapter)];
			}
		});

		// Fire all checks in parallel. Update each card as its result arrives.
		Checker.check_each(url_map, (name, status) => {
			// Discard stale results if the user has already switched to a different chapter.
			if (_manga?.id !== manga.id || _chapter?.chapter !== chapter.chapter) return;

			const src = sources.find(s => s.name === name);
			if (!src) return;

			const card = body.querySelector(`a.source_item[data-site="${CSS.escape(name)}"]`);
			if (!card) return;

			// Swap the badge element in place.
			const old_badge = card.querySelector(".check_badge, .found_badge");
			if (old_badge) old_badge.replaceWith(make_badge(status));

			card.classList.remove("checking", "not_found");
			if (status === "not_found") card.classList.add("not_found");
			// Bubble confirmed-available cards to the top of the list.
			if (status === "found") body.prepend(card);
		});
	}

	// Build a single source card as an HTML string.
	// availability: "checking" | "found" | "not_found" | "browse"
	// visited: true if the user has already clicked this source for this chapter
	function build_card(src, manga, chapter, availability, visited) {
		const url = src.chapter_url(manga, chapter);

		const note_for_user = PAYWALL_SOURCES.has(src.name)
			? `<span class="paywall_note">some chapters may not be free</span>`
			: "";

		const badge_html = {
			checking:  `<span class="check_badge">checking...</span>`,
			found:     `<span class="found_badge">available</span>`,
			not_found: `<span class="check_badge">not found</span>`,
			browse:    `<span class="browse_badge">browse</span>`,
		}[availability] ?? "";
		const visited_html = visited ? `<span class="visited_badge">visited</span>` : "";
		const extra_class  = availability === "not_found" ? " not_found" : availability === "checking" ? " checking" : "";

		return `
      <a href="${url}" target="_blank" rel="noopener noreferrer"
         class="source_item${visited ? " visited" : ""}${extra_class}"
         data-site="${src.name}" data-ch="${UI.escape_html(chapter.chapter || "oneshot")}">
        <div class="source_left">
          <div class="source_icon">${src.icon}</div>
          <div class="source_name">${src.name}${note_for_user}</div>
        </div>
        <div class="source_right">
          ${visited_html}
          ${badge_html}
          <span style="color:var(--muted);font-size:0.8rem;">-></span>
        </div>
      </a>`;
	}

	// Create a badge DOM element from an availability string.
	// Used when swapping badges in-place after a check resolves.
	function make_badge(availability) {
		if (availability === "checking")  return Object.assign(document.createElement("span"), { className: "check_badge",  textContent: "checking..."  });
		if (availability === "found")     return Object.assign(document.createElement("span"), { className: "found_badge",  textContent: "available"    });
		if (availability === "not_found") return Object.assign(document.createElement("span"), { className: "check_badge",  textContent: "not found"    });
		if (availability === "browse")    return Object.assign(document.createElement("span"), { className: "browse_badge", textContent: "browse"       });
		return document.createElement("span");
	}

	// Build the Google search fallback section shown at the bottom of every modal.
	function google_section(manga, chapter) {
		const q = encodeURIComponent(`${manga.title} chapter ${chapter.chapter || 1} read online`);
		return `<div class="google_section">
      <a href="https://www.google.com/search?q=${q}" target="_blank" class="ext_link">Google search -></a>
    </div>`;
	}

	// Attach click listeners to all source link cards.
	// When clicked, records the visit and adds the "visited" badge.
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

	// Close on X button, backdrop click, or Escape key.
	close_btn.addEventListener("click", close);
	modal.addEventListener("click", e => { if (e.target === modal) close(); });
	document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });

	return { init, open, close };

})();
