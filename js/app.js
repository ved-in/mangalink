/*
 * app.js
 *
 * Entry point. Wires all the modules together and owns the top-level
 * application state (which manga is selected, the full chapter list, sort order).
 *
 * Module dependency order (loaded via script tags in index.html):
 *   utils.js -> source files -> storage.js -> api.js -> checker.js
 *   -> ui.js -> modal.js -> bookmarks.js -> app.js
 *
 * State:
 *   current_manga  -- the manga whose chapters are shown in the right panel
 *   all_chapters   -- unfiltered chapter array for current_manga
 *   sort_asc       -- whether chapters are sorted ascending (oldest first)
 */

const App = (
	() => {

		// Top-level state
		let current_manga = null;
		let all_chapters  = [];
		let sort_asc      = false;

		// Cache DOM references grabbed once on load (may not exist on all pages)
		const input      = document.getElementById("search_input");
		const search_btn = document.getElementById("search_btn");
		const input_2     = document.getElementById("search_input_2");
		const search_btn_2 = document.getElementById("search_btn_2");
		const container  = document.getElementById("main_container");
		const home_wrap = document.querySelector(".h-screen-wrap");
		const top_logo  = document.querySelector(".top_logo");
		const bookmark_btn = document.querySelector(".bookmark_btn") || document.getElementById("bookmark_btn_home");
		const ch_filter  = document.getElementById("chapter_search");
		const manga_header_title = document.getElementById("manga_header_title");
		const manga_header_meta = document.getElementById("manga_header_meta");
		const manga_header_cover = document.getElementById("manga_header_cover");
		const chapter_controls = document.getElementById("chapter_controls");
		const manga_header = document.getElementById("manga_header");
		const chapters_panel = document.getElementById("chapters_panel");

		// Run once when the DOM is ready.
		async function init()
		{
			// Read URL parameter if coming from homepage search
			const params = new URLSearchParams(window.location.search);
			const url_q = params.get('q');
			if (url_q) {
				if (input) input.value = url_q;
				if (input_2) input_2.value = url_q;
			}

			// Load bookmarks from localStorage before anything renders.
			if (typeof Bookmarks !== "undefined") {
				Bookmarks.load();
			}

			// Wire up the modal's visit callbacks so it can update read state.
			if (typeof Modal !== "undefined" && typeof Bookmarks !== "undefined") {
				Modal.init(
					{
						on_visit: (manga_id, ch_num, site) => {
							Bookmarks.mark_visited(manga_id, ch_num, site);
							// Immediately dot the chapter row green if it is currently visible.
							if (current_manga?.id === manga_id && typeof UI !== "undefined") UI.mark_chapter_read(ch_num);
						},
						was_visited: (manga_id, ch_num, site) => Bookmarks.was_visited(manga_id, ch_num, site),
					}
				);
			}

			// Restore sort preference from localStorage (defaults to descending).
			let asc_desc_storage = localStorage.getItem("mangalink:sort_asc");
			sort_asc = asc_desc_storage === "true";
			if (document.getElementById("sort_btn")) {
				document.getElementById("sort_btn").textContent = sort_asc ? "↑" : "↓";
			}

			// Sort button toggles ascending/descending and re-renders the visible list.
			if (document.getElementById("sort_btn")) {
				document.getElementById("sort_btn").addEventListener(
					"click", () => {
						sort_asc = !sort_asc;
						document.getElementById("sort_btn").textContent = sort_asc ? "↑" : "↓";
						localStorage.setItem("mangalink:sort_asc", sort_asc);
						filter_chapters();
					}
				);
			}

			// Suggestion state
			let sugg_timer = null;
			let sugg_box = null;
			let sugg_selected_idx = -1;

			function create_suggestion_box(parent) {
				if (sugg_box) sugg_box.remove();
				sugg_box = document.createElement("div");
				sugg_box.className = "suggestions_box";
				parent.appendChild(sugg_box);
			}

			function handle_keydown(e, inputEl) {
				if (!sugg_box || sugg_box.style.display === "none") {
					if (e.key === "Enter") do_search();
					return;
				}
				const items = sugg_box.querySelectorAll(".suggestion_item");
				if (items.length === 0) {
					if (e.key === "Enter") do_search();
					return;
				}

				if (e.key === "ArrowDown") {
					e.preventDefault();
					sugg_selected_idx = (sugg_selected_idx + 1) % items.length;
					update_suggestion_highlight(items);
				} else if (e.key === "ArrowUp") {
					e.preventDefault();
					sugg_selected_idx = sugg_selected_idx - 1;
					if (sugg_selected_idx < 0) sugg_selected_idx = items.length - 1;
					update_suggestion_highlight(items);
				} else if (e.key === "Enter") {
					e.preventDefault();
					if (sugg_selected_idx >= 0 && sugg_selected_idx < items.length) {
						let m_title = items[sugg_selected_idx].textContent;
						inputEl.value = m_title;
						if (inputEl.id === "search_input" && input_2) input_2.value = m_title;
						if (inputEl.id === "search_input_2" && input) input.value = m_title;
					}
					sugg_box.style.display = "none";
					do_search();
				}
			}

			function update_suggestion_highlight(items) {
				items.forEach((item, idx) => {
					if (idx === sugg_selected_idx) item.classList.add("active");
					else item.classList.remove("active");
				});
			}

			function handle_input_suggest(q, inputEl, parentEl) {
				clearTimeout(sugg_timer);
				sugg_timer = setTimeout(async () => {
					let query = q.trim();
					if (!query) {
						if (sugg_box) sugg_box.style.display = "none";
						return;
					}
					
					const res = await API.search_manga(query);
					if (res.length === 0) {
						if (sugg_box) sugg_box.style.display = "none";
						return;
					}
					
					if (!sugg_box || sugg_box.parentElement !== parentEl) {
						create_suggestion_box(parentEl);
					}

					if (inputEl.id === "search_input") {
						sugg_box.style.width = inputEl.offsetWidth + "px";
					} else {
						sugg_box.style.width = "auto";
					}

					sugg_box.innerHTML = "";
					sugg_selected_idx = -1;
					res.slice(0, 5).forEach(m => {
						let item = document.createElement("div");
						item.className = "suggestion_item";
						item.textContent = m.title;
						item.addEventListener("mousedown", (e) => {
							e.preventDefault(); // prevent blur
							inputEl.value = m.title;
							if (inputEl.id === "search_input" && input_2) input_2.value = m.title;
							if (inputEl.id === "search_input_2" && input) input.value = m.title;
							sugg_box.style.display = "none";
							do_search();
						});
						sugg_box.appendChild(item);
					});
					sugg_box.style.display = "flex";
				}, 200);
			}

			// Search button handlers
			if (search_btn) {
				search_btn.addEventListener("click", () => do_search());
				if (input) {
					const parent = input.parentElement;
					input.addEventListener("input", e => { 
						if (input_2) input_2.value = e.target.value; 
						handle_input_suggest(e.target.value, input, parent);
					});
					input.addEventListener("focus", e => handle_input_suggest(e.target.value, input, parent));
					input.addEventListener("blur", () => { if (sugg_box) sugg_box.style.display = "none"; });
					input.addEventListener("keydown", e => handle_keydown(e, input));
				}
			}

			if (search_btn_2) {
				search_btn_2.addEventListener("click", () => {
					const is_bookmark_page = window.location.pathname.includes("bookmark.html");
					if (is_bookmark_page) return;
					do_search();
				});
				if (input_2) {
					const parent = input_2.parentElement;
					input_2.addEventListener("input", e => { 
						const val = e.target.value;
						if (input) input.value = val; 
						const is_bookmark_page = window.location.pathname.includes("bookmark.html");
						if (is_bookmark_page) {
							render_bookmarks(val);
						} else {
							handle_input_suggest(val, input_2, parent);
						}
					});
					input_2.addEventListener("focus", e => {
						const is_bookmark_page = window.location.pathname.includes("bookmark.html");
						if (!is_bookmark_page) handle_input_suggest(e.target.value, input_2, parent);
					});
					input_2.addEventListener("blur", () => { if (sugg_box) sugg_box.style.display = "none"; });
					input_2.addEventListener("keydown", e => {
						const is_bookmark_page = window.location.pathname.includes("bookmark.html");
						if (!is_bookmark_page) handle_keydown(e, input_2);
					});
				}
			}

			// Chapter filter box
			if (ch_filter) {
				ch_filter.addEventListener("input", filter_chapters);
			}

			// Logo click goes back to homepage
			if (top_logo && home_wrap) {
				top_logo.addEventListener("click", () => {
					window.location.href = '/';
				});
			}

			// Bookmark button (homepage)
			if (bookmark_btn) {
				bookmark_btn.addEventListener("click", () => {
					window.location.href = '/bookmark.html';
				});
			}

			// Show container if on search-result or bookmark page
			if (container) {
				show_container();
			}

			if (document.getElementById("bm_list")) {
				render_bookmarks();
			}

			// Auto-search if query param present
			if (url_q && (input || input_2)) {
				do_search();
			}

			const mobile_back_btn = document.getElementById("mobile_back_btn");
			if (mobile_back_btn) {
				mobile_back_btn.addEventListener("click", () => {
					if (container) container.classList.remove("manga_selected");
					if (chapters_panel) chapters_panel.style.display = "none";
					// Also deselect cards so they don't stay selected
					document.querySelectorAll(".manga_card, .bm_item").forEach(c => c.classList.remove("selected"));
				});
			}
		}

		// Show container properly
		function show_container() {
			if (home_wrap) home_wrap.style.display = "none";
			if (container) {
				container.style.display = "grid";
				container.style.position = "relative";
				container.style.top = "auto";
				container.style.left = "auto";
				container.style.transform = "none";
			}
		}

		// Run a search against the API
		async function do_search()
		{
			const q = (input?.value.trim() || "") || (input_2?.value.trim() || "");
			if (!q) return;

			// If we are on the homepage (no container), redirect!
			if (!container && !document.getElementById("results_list")) {
				window.location.href = '/search-result.html?q=' + encodeURIComponent(q);
				return;
			}

			if (search_btn) {
				search_btn.disabled = true;
				search_btn.textContent = "...";
			}
			if (search_btn_2) {
				search_btn_2.disabled = true;
				search_btn_2.textContent = "...";
			}

			try {
				show_container();
				UI.show_skeletons("results_list", 4);
				const results = await API.search_manga(q);
				UI.render_manga_results(
					results,
					"results_list",
					{
						is_bookmarked: id => Bookmarks.is_bookmarked(id),
						on_select:     select_manga,
						on_bookmark:   toggle_bookmark,
					}
				);
			}
			catch (e)
			{
				UI.show_error("results_list", e.message.slice(0, 80));
			}
			finally
			{
				if (search_btn) {
					search_btn.disabled = false;
					search_btn.textContent = "Search";
				}
				if (search_btn_2) {
					search_btn_2.disabled = false;
					search_btn_2.textContent = "Search";
				}
			}
		}

		// Called when a result card is clicked.
		async function select_manga(manga, card_el)
		{
			// Deselect any previously selected card.
			document.querySelectorAll(".manga_card, .bm_item").forEach(c => c.classList.remove("selected"));
			if (card_el) card_el.classList.add("selected");

			current_manga = manga;
			all_chapters  = [];
			if (manga_header_title) manga_header_title.textContent = manga.title;
			if (manga_header_meta) manga_header_meta.textContent = manga.max_chapter ? `${manga.max_chapter} chapters` : `${manga.sources?.length || 0} sources`;
			if (manga_header_cover) manga_header_cover.style.backgroundImage = manga.cover ? `url("${manga.cover.replace(/"/g, '%22')}")` : "";
			if (ch_filter) ch_filter.value = "";
			if (chapter_controls) chapter_controls.style.display = "flex";
			if (manga_header) manga_header.style.display = "flex";
			if (chapters_panel) chapters_panel.style.display = "flex";
			if (container) container.classList.add("manga_selected");

			UI.show_loading("chapters_list", "Loading chapters...");

			try
			{
				all_chapters = await API.fetch_chapters(manga);
				console.log(`[MangaLink] "${manga.title}" -- max_chapter: ${manga.max_chapter} | sources: ${manga.sources.join(", ")}`);
				Bookmarks.update_total(manga.id, all_chapters.length);
				filter_chapters();
			}
			catch (e)
			{
				console.error(`[MangaLink] Failed to load chapters for "${manga.title}":`, e);
				UI.show_error("chapters_list", "Failed to load chapters.");
			}
		}

		// Pass the current chapter list to UI for rendering.
		function render_chapters(chapters) {
			UI.render_chapter_list(
				chapters,
				"chapters_list",
				{
					is_read:         ch_num  => current_manga && Bookmarks.is_chapter_read(current_manga.id, ch_num),
					on_open_sources: chapter => Modal.open(current_manga, chapter),
					manga:           current_manga,
				}
			);
		}

		// Filter all_chapters by the chapter search box and apply sort, then re-render.
		function filter_chapters()
		{
			if (!ch_filter || !all_chapters.length) return;
			const q = ch_filter.value.trim().toLowerCase();
			let filtered = q
				? all_chapters.filter(ch =>
					ch.chapter?.startsWith(q) ||
					ch.title?.toLowerCase().includes(q))
				: [...all_chapters];
			if (sort_asc) filtered.reverse();
			render_chapters(filtered);
		}

		// Toggle a bookmark on the currently hovered/clicked result card.
		function toggle_bookmark(manga)
		{
			const now_bookmarked = Bookmarks.toggle(manga, all_chapters.length);
			UI.refresh_bm_button(manga.id, now_bookmarked);
		}

		// Render the bookmarks panel. Also wires up Open and Remove buttons.
		function render_bookmarks(query = "") {
			if (typeof Bookmarks === "undefined" || typeof UI === "undefined") return;
			
			let items = Bookmarks.get_all();
			if (query.trim()) {
				const q = query.trim().toLowerCase();
				items = items.filter(m => m.title.toLowerCase().includes(q));
			}

			UI.render_bookmarks(items, "bm_list", {
				on_open: async (id, item_el) => {
					try {
						const manga = await API.get_manga(id);
						select_manga(manga, item_el);
					} catch (e) {
						console.error(e);
					}
				},
				on_remove: (manga_id) => {
					Bookmarks.remove(manga_id);
					UI.refresh_bm_button(manga_id, false);
					render_bookmarks(query); // maintain active filter state
				}
			});
		}

		// Kick everything off after the DOM is ready.
		document.addEventListener("DOMContentLoaded", init);

	}
)();