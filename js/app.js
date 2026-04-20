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
 *
 *   ⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⡤⣄⡀⠀
 *   ⠶⡿⠟⠛⠛⠛⠛⠛⠿⠷⠶⡶⠦⠀⠀⠀⠻⢶⡶⠿⠿⠟⠛⠛⠛⠛⠷⢿⠲
 *   ⠀⠀⠀⢀⡠⢮⣭⣭⣼⣏⡓⢦⠀⠀⠀⠀⢀⡴⢛⣻⣿⣽⣿⡷⠤⣀⠀⠀⠈
 *   ⠀⠀⠐⠙⠤⠼⠿⠿⠇⠙⡄⠸⠀⠀⠀⠀⠈⠇⠠⠧⠼⠿⠿⠧⠴⠚⠁⠀⠀
 */

const App = (
	() => {

		// Top-level state
		let current_manga = null;
		let all_chapters  = [];
		let sort_asc      = false;

		// Cache DOM references grabbed once on load
		const input      = document.getElementById("search_input");
		const search_btn = document.getElementById("search_btn");
		const container  = document.getElementById("main_container");
		const ch_filter  = document.getElementById("chapter_search");
		const sel_title  = document.getElementById("selected_title");

		// Run once when the DOM is ready.
		async function init()
		{
			// Load bookmarks from localStorage before anything renders.
			Bookmarks.load();

			// Wire up the modal's visit callbacks so it can update read state.
			Modal.init(
				{
					on_visit: (manga_id, ch_num, site) => {
						Bookmarks.mark_visited(manga_id, ch_num, site);
						// Immediately dot the chapter row green if it is currently visible.
						if (current_manga?.id === manga_id) UI.mark_chapter_read(ch_num);
					},
					was_visited: (manga_id, ch_num, site) => Bookmarks.was_visited(manga_id, ch_num, site),
				}
			);

			// Restore sort preference from localStorage (defaults to descending).
			let asc_desc_storage = localStorage.getItem("mangalink:sort_asc");
			sort_asc = asc_desc_storage === "true";
			document.getElementById("sort_btn").textContent = sort_asc ? "↑" : "↓";

			// Sort button toggles ascending/descending and re-renders the visible list.
			document.getElementById("sort_btn").addEventListener(
				"click", () => {
					sort_asc = !sort_asc;
					document.getElementById("sort_btn").textContent = sort_asc ? "↑" : "↓";
					localStorage.setItem("mangalink:sort_asc", sort_asc);
					filter_chapters();
				}
			);

			// Debounced search: wait 300ms after the user stops typing before firing.
			// Pressing Enter skips the delay and searches immediately.
			let _search_timer = null;

			function _debounced_search()
			{
				clearTimeout(_search_timer);
				_search_timer = setTimeout(do_search, 300);
			}

			search_btn.addEventListener("click", do_search);
			input.addEventListener("input", _debounced_search);
			input.addEventListener("keydown", e => {
				if (e.key === "Enter") { clearTimeout(_search_timer); do_search(); }
			});

			// Chapter filter box -- re-filter the current list as the user types.
			ch_filter.addEventListener("input", filter_chapters);

			// Tab switcher (Search / Bookmarks).
			document.querySelectorAll(".tab").forEach(tab =>
				tab.addEventListener("click", () => switch_tab(tab.dataset.tab))
			);
		}

		// Show the Search or Bookmarks tab.
		function switch_tab(name)
		{
			document.querySelectorAll(".tab").forEach(t =>
				t.classList.toggle("active", t.dataset.tab === name)
			);
			document.getElementById("search_view").style.display     = name === "search"    ? "" : "none";
			document.getElementById("bookmarks_view").style.display  = name === "bookmarks" ? "" : "none";
			// Render fresh bookmark list each time the tab is opened.
			if (name === "bookmarks") render_bookmarks();
		}

		// Run a search against the API and render results.
		// Disables the button while loading to prevent double-submits.
		async function do_search()
		{
			const q = input.value.trim();
			if (!q) return;

			search_btn.disabled = true;
			search_btn.textContent = "...";
			container.style.display = "grid";
			UI.show_skeletons("results_list", 4);

			try {
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
				move_search_to_panel();
			}
			catch (e)
			{
				UI.show_error("results_list", e.message.slice(0, 80));
			}
			finally
			{
				search_btn.disabled = false;
				search_btn.textContent = "Search";
			}
		}

		// Called when a result card is clicked.
		// Highlights the card, loads the chapter list, and updates the right panel.
		async function select_manga(manga, card_el)
		{
			// Deselect any previously selected card.
			document.querySelectorAll(".manga_card").forEach(c => c.classList.remove("selected"));
			card_el.classList.add("selected");

			current_manga = manga;
			all_chapters  = [];
			sel_title.textContent = manga.title;
			ch_filter.value = "";

			UI.show_loading("chapters_list", "Loading chapters...");

			try
			{
				all_chapters = await API.fetch_chapters(manga);
				console.log(`[MangaLink] "${manga.title}" -- max_chapter: ${manga.max_chapter} | sources: ${manga.sources.join(", ")}`);
				// Update the bookmark's total chapter count so its progress bar stays accurate.
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
			const q = ch_filter.value.trim().toLowerCase();
			let filtered = q
				? all_chapters.filter(ch =>
					ch.chapter?.startsWith(q) ||
					ch.title?.toLowerCase().includes(q))
				: [...all_chapters];
			// all_chapters is always stored descending; reverse it for ascending view.
			if (sort_asc) filtered.reverse();
			render_chapters(filtered);
		}

		// Toggle a bookmark on the currently hovered/clicked result card.
		function toggle_bookmark(manga)
		{
			const now_bookmarked = Bookmarks.toggle(manga, all_chapters.length);
			UI.refresh_bm_button(manga.id, now_bookmarked);
			// If the bookmarks panel is open, refresh it immediately.
			if (document.getElementById("bookmarks_view").style.display !== "none") render_bookmarks();
		}

		// Render the bookmarks panel. Also wires up Open and Remove buttons.
		function render_bookmarks()
		{
			const bm_list = Bookmarks.get_all();
			UI.render_bookmarks(
				bm_list,
				"bm_list",
				{
					// Opening a bookmark: switch to search, fill the input, and search.
					on_open: id => {
						const bm = bm_list.find(b => b.id === id);
						if (!bm) return;
						switch_tab("search");
						input.value = bm.title;
						do_search();
					},
					on_remove: id => { Bookmarks.remove(id); UI.refresh_bm_button(id, false); },
				}
			);
		}

		// Kick everything off after the DOM is ready.
		document.addEventListener("DOMContentLoaded", init);

	}
)();
