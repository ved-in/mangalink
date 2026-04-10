/*
Wires up everything together.

⠀⠀⠀⣀⣀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣀⡤⣄⡀⠀
⠶⡿⠟⠛⠛⠛⠛⠛⠿⠷⠶⡶⠦⠀⠀⠀⠻⢶⡶⠿⠿⠟⠛⠛⠛⠛⠷⢿⠲
⠀⠀⠀⢀⡠⢮⣭⣭⣼⣏⡓⢦⠀⠀⠀⠀⢀⡴⢛⣻⣿⣽⣿⡷⠤⣀⠀⠀⠈
⠀⠀⠐⠙⠤⠼⠿⠿⠇⠙⡄⠸⠀⠀⠀⠀⠈⠇⠠⠧⠼⠿⠿⠧⠴⠚⠁⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢠⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⣠⠏⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⡴⠀⢠⠏⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⡀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⣠⠴⠋⠀⠀⡞⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠿⠉⠉⠛⠛⠛⠋⠉⠉⠉⠉⠀⠀⠀⠀⠀⣰⡁⠀⠀⠀⠀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠀⠀⠀⠀⠀

*/

const App = (
	() => {

		let current_manga = null;
		let all_chapters = [];
		let sort_asc = false;

		const input = document.getElementById("search_input");
		const search_btn = document.getElementById("search_btn");
		const container = document.getElementById("main_container");
		const ch_filter = document.getElementById("chapter_search");
		const sel_title = document.getElementById("selected_title");

		async function init()
		{
			Bookmarks.load();
			Modal.init(
				{
					on_visit: (manga_id, ch_num, site) => {
						Bookmarks.mark_visited(manga_id, ch_num, site);
						if (current_manga?.id === manga_id) UI.mark_chapter_read(ch_num);
					},
					was_visited: (manga_id, ch_num, site) => Bookmarks.was_visited(manga_id, ch_num, site),
				}
			);

			let asc_desc_storage = localStorage.getItem("mangalink:sort_asc");
			sort_asc = asc_desc_storage === "true";
			document.getElementById("sort_btn").textContent = sort_asc ? "↑" : "↓";

			document.getElementById("sort_btn").addEventListener(
				"click", () => {
					sort_asc = !sort_asc;
					document.getElementById("sort_btn").textContent = sort_asc ? "↑" : "↓";
					localStorage.setItem("mangalink:sort_asc", sort_asc);
					filter_chapters();
				}
			);
			search_btn.addEventListener("click", do_search);
			input.addEventListener("keydown", e => { if (e.key === "Enter") do_search(); });
			ch_filter.addEventListener("input", filter_chapters);
			document.querySelectorAll(".tab").forEach(tab => tab.addEventListener("click", () => switch_tab(tab.dataset.tab)));
		}

		function switch_tab(name)
		{
			document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === name));
			document.getElementById("search_view").style.display = name === "search" ? "" : "none";
			document.getElementById("bookmarks_view").style.display = name === "bookmarks" ? "" : "none";
			if (name === "bookmarks") render_bookmarks();
		}

		async function do_search()
		{
			const q = input.value.trim();
			if (!q) return;

			search_btn.disabled = true;
			search_btn.textContent = "…";
			container.style.display = "grid";
			UI.show_skeletons("results_list", 4);

			try {
				const results = await API.search_manga(q);
				UI.render_manga_results(
					results,
					"results_list", 
					{
						is_bookmarked: id => Bookmarks.is_bookmarked(id),
						on_select: select_manga,
						on_bookmark: toggle_bookmark,
					}
				);
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

		async function select_manga(manga, card_el)
		{
			document.querySelectorAll(".manga_card").forEach(c => c.classList.remove("selected"));
			card_el.classList.add("selected");

			current_manga = manga;
			all_chapters = [];
			sel_title.textContent = manga.title;
			ch_filter.value = "";

			UI.show_loading("chapters_list", "Loading chapters…");

			try
			{
				all_chapters = await API.fetch_chapters(manga);
                console.log(`[MangaLink] "${manga.title}" — max_chapter: ${manga.max_chapter} | sources: ${Object.keys(manga.sources || {}).join(", ")}`);
				Bookmarks.update_total(manga.id, all_chapters.length);
				filter_chapters();
			}
			catch (e)
			{
				console.error(`[MangaLink] Failed to load chapters for "${manga.title}":`, e);
				UI.show_error("chapters_list", "Failed to load chapters.");
			}
		}

		function render_chapters(chapters) {
			UI.render_chapter_list(
				chapters,
				"chapters_list",
				{
					is_read: ch_num => current_manga && Bookmarks.is_chapter_read(current_manga.id, ch_num),
					on_open_sources: chapter => Modal.open(current_manga, chapter),
					manga: current_manga,
				}
			);
		}

		function filter_chapters()
		{
			const q = ch_filter.value.trim().toLowerCase();
			let filtered = q
				? all_chapters.filter(ch =>
					ch.chapter?.startsWith(q) ||
					ch.title?.toLowerCase().includes(q))
				: [...all_chapters];
			if (sort_asc) filtered.reverse();
			render_chapters(filtered);
		}

		function toggle_bookmark(manga)
		{
			const now_bookmarked = Bookmarks.toggle(manga, all_chapters.length);
			UI.refresh_bm_button(manga.id, now_bookmarked);
			if (document.getElementById("bookmarks_view").style.display !== "none") render_bookmarks();
		}

		function render_bookmarks()
		{
			Bookmarks.render_list(
				"bm_list", 
				{
					on_open: bm => { switch_tab("search"); input.value = bm.title; do_search(); },
					on_remove: id => { Bookmarks.remove(id); UI.refresh_bm_button(id, false); },
				}
			);
		}

		document.addEventListener("DOMContentLoaded", init);

	}
)();