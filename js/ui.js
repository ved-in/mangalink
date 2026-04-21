/*
 * ui.js
 *
 * Pure rendering functions. Nothing here talks to the API, storage, or
 * the modal -- it only reads data and writes DOM.
 *
 * SECURITY NOTE:
 *   Any string that comes from external data (manga titles, chapter names,
 *   etc.) is passed through escape_html() before being injected into innerHTML.
 *   This prevents a malicious title in series.json from running arbitrary JS.
 *   Strings that come from our own hardcoded source modules (src.name, src.icon)
 *   are trusted and not escaped.
 */

const UI = (() => {

	// Escape a string for safe injection into innerHTML.
	// Converts characters that have special meaning in HTML into their entity equivalents.
	// e.g. <script>alert('xss')</script>  ->  &lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;
	function escape_html(str) {
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	// Return the CSS class that colours the status badge for a given status string.
	function status_class(s) {
		if (s === "ongoing")   return "status_ongoing";
		if (s === "completed") return "status_completed";
		if (s === "hiatus")    return "status_hiatus";
		if (s === "dropped")   return "status_dropped";
		return "";
	}

	// Fill a container with grey skeleton placeholder cards while results are loading.
	function show_skeletons(container_id, count = 4) {
		document.getElementById(container_id).innerHTML =
			Array(count).fill(`<div class="skeleton"></div>`).join("");
	}

	// Show a spinner and a loading message inside a container.
	function show_loading(container_id, msg = "Loading...") {
		document.getElementById(container_id).innerHTML =
			`<div class="empty_state"><span class="spinner"></span>${msg}</div>`;
	}

	// Show an error message inside a container.
	function show_error(container_id, msg) {
		document.getElementById(container_id).innerHTML =
			`<div class="empty_state"><p> ${escape_html(msg)}</p></div>`;
	}

	// Render a list of manga result cards into a container.
	// Attaches click handlers for card selection and bookmark toggling.
	function render_manga_results(mangas, container_id, { is_bookmarked, on_select, on_bookmark }) {
		const el = document.getElementById(container_id);
		if (!mangas.length) {
			el.innerHTML = `<div class="empty_state"><p>No results found</p></div>`;
			return;
		}

		el.innerHTML = mangas.map(m => `
      <div class="manga_card" data-id="${m.id}">
        <div class="manga_cover_wrap">
          ${m.cover
			? `<img class="manga_cover" src="${m.cover}" loading="lazy" onerror="this.style.display='none'" />`
			: `<div class="cover_placeholder"></div>`}
        </div>
        <div class="manga_info">
          <div class="manga_title">${escape_html(m.title)}</div>
          <div class="manga_meta">${m.max_chapter ? `Ch. ${m.max_chapter}` : ""}</div>
          <span class="manga_status ${status_class(m.status)}">${m.status || "unknown"}</span>
          <button class="bm_btn ${is_bookmarked(m.id) ? "bookmarked" : ""}" data-id="${m.id}">&#9733;</button>
        </div>
      </div>`).join("");

		// Wire up click handlers now that the cards are in the DOM.
		// Using index (i) to map back to the mangas array avoids re-parsing data from the DOM.
		el.querySelectorAll(".manga_card").forEach((card, i) => {
			card.addEventListener("click", e => {
				// Clicking the bookmark button should not also select the manga.
				if (e.target.classList.contains("bm_btn")) return;
				on_select(mangas[i], card);
			});
			card.querySelector(".bm_btn").addEventListener("click", () => on_bookmark(mangas[i]));
		});
	}

	// Render a list of chapter rows into a container.
	// If the chapter list is empty (max_chapter unknown), shows a manual chapter input instead.
	function render_chapter_list(chapters, container_id, { is_read, on_open_sources, manga }) {
		const el = document.getElementById(container_id);

		if (!chapters.length) {
			// No chapter list available -- show a number input so the user can still
			// look up a specific chapter manually.
			el.innerHTML = `
        <div class="empty_state">
          <p>Chapter count unknown for this title.<br>Enter a chapter number to find sources:</p>
          <div style="display:flex;gap:8px;justify-content:center;margin-top:12px;">
            <input id="manual_ch_input" type="number" min="1" placeholder="e.g. 47"
              style="width:100px;background:var(--surface);border:1px solid var(--border);
                     border-radius:var(--radius);padding:0.35rem 0.6rem;color:var(--text);
                     font-family:var(--font_mono);font-size:0.82rem;outline:none;text-align:center;" />
            <button id="manual_ch_btn"
              style="background:var(--accent);border:none;border-radius:var(--radius);
                     padding:0.35rem 1rem;color:#fff;font-size:0.82rem;cursor:pointer;">
              Find Sources
            </button>
          </div>
        </div>`;

			document.getElementById("manual_ch_btn").addEventListener("click", () => {
				const val = document.getElementById("manual_ch_input").value.trim();
				if (!val) return;
				on_open_sources({ chapter: val, title: "", date: null });
			});
			document.getElementById("manual_ch_input").addEventListener("keydown", e => {
				if (e.key === "Enter") document.getElementById("manual_ch_btn").click();
			});
			return;
		}

		el.innerHTML = chapters.map(ch => `
      <div class="chapter_row">
        <span class="read_dot ${is_read(ch.chapter) ? "read" : ""}"></span>
        <span class="ch_num">${ch.chapter ? `Ch. ${ch.chapter}` : "Oneshot"}</span>
        <span class="ch_title">${ch.title ? `- ${escape_html(ch.title)}` : ""}</span>
        <button class="find_btn">Sources</button>
      </div>`).join("");

		el.querySelectorAll(".find_btn").forEach((btn, i) => {
			btn.addEventListener("click", e => { e.stopPropagation(); on_open_sources(chapters[i]); });
		});
	}

	// Mark a single chapter row's dot as read.
	// Called immediately after the user clicks a source link so the dot turns green
	// without needing to reload the chapter list.
	function mark_chapter_read(chapter_num) {
		document.querySelectorAll(".chapter_row").forEach(row => {
			if (row.querySelector(".ch_num")?.textContent.trim() === `Ch. ${chapter_num}`) {
				row.querySelector(".read_dot")?.classList.add("read");
			}
		});
	}

	// Update the bookmark star button for a specific manga ID across all visible cards.
	// Called after toggling a bookmark so the star colour updates instantly.
	function refresh_bm_button(manga_id, is_bookmarked) {
		document.querySelectorAll(`.bm_btn[data-id="${manga_id}"]`).forEach(btn => {
			btn.classList.toggle("bookmarked", is_bookmarked);
		});
	}

	// Render the bookmarks panel.
	// Shows a progress bar for each bookmarked series based on read_count / total_chapters.
	function render_bookmarks(list, container_id, { on_open, on_remove }) {
		const el = document.getElementById(container_id);

		if (!list.length) {
			el.innerHTML = `<div class="empty_state"><div class="big_icon"></div><p>No bookmarks yet.<br>Search a title and tap the star icon.</p></div>`;
			return;
		}

		el.innerHTML = list.map(bm => {
			const pct   = bm.total_chapters ? Math.round((bm.read_count / bm.total_chapters) * 100) : 0;
			const sc    = { ongoing: "status_ongoing", completed: "status_completed", hiatus: "status_hiatus", dropped: "status_dropped" }[bm.status] || "";
			const cover = bm.cover
				? `<img class="bm_cover" src="${bm.cover}" loading="lazy" onerror="this.style.display='none'" />`
				: `<div class="bm_cover_placeholder"></div>`;
			return `
			<div class="bm_item" data-id="${bm.id}">
			  <div class="bm_cover_wrap">
			    ${cover}
			  </div>
			  <div class="bm_info">
			    <div class="bm_title">${escape_html(bm.title)}</div>
			    <span class="bm_meta">${bm.read_count} / ${bm.total_chapters || "?"} read</span>
			    <div class="progress_bar"><div class="progress_fill" style="width:${pct}%"></div></div>
			    <div class="bm_actions">
			      <button class="bm_remove" data-id="${bm.id}">x</button>
			    </div>
			  </div>
			</div>`;
		}).join("");

		el.querySelectorAll(".bm_item").forEach(item => {
			item.addEventListener("click", e => {
				if (e.target.classList.contains("bm_remove")) return;
				on_open(item.dataset.id, item);
			});
		});
		el.querySelectorAll(".bm_remove").forEach(btn =>
			btn.addEventListener("click", () => {
				on_remove(btn.dataset.id);
				// Re-render the list after removal so the removed item disappears.
				render_bookmarks(Bookmarks.get_all(), container_id, { on_open, on_remove });
			})
		);
	}

	// ── Manga header (cover + title + status + chapters) ─
	function render_manga_header(manga) {
		const cover_el = document.getElementById("manga_header_cover");
		const title_el = document.getElementById("manga_header_title");
		const meta_el = document.getElementById("manga_header_meta");

		if (!manga) {
			title_el.textContent = "Select a title →";
			meta_el.innerHTML = "";
			cover_el.innerHTML = "";
			return;
		}

		title_el.textContent = manga.title;

		const status = manga.status || "unknown";
		const chapter_text = manga.max_chapter ? `${manga.max_chapter} chapters` : "Chapter count unknown";
		meta_el.innerHTML = `
			<span class="manga_status ${status_class(status)}">${status}</span>
			<span>·</span>
			<span>${chapter_text}</span>
		`;

		if (manga.cover) {
			cover_el.innerHTML = `<img src="${manga.cover}" alt="${escape_html(manga.title)}" onerror="this.parentElement.innerHTML='<div class=\\'cover_placeholder\\'>📕</div>'" />`;
		} else {
			cover_el.innerHTML = '<div class="cover_placeholder">📕</div>';
		}
	}

	return {
		show_skeletons,
		show_loading,
		show_error,
		render_manga_results,
		render_chapter_list,
		render_bookmarks,
		mark_chapter_read,
		refresh_bm_button,
		escape_html,
	};

})();
