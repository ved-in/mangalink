/*
Just... renders... Just rendering.
Nothing more nothing less.

escape_html turns stuff like:
 =>	<script>alert('hacked')</script>
into
 =>	&lt;script&gt;alert('hacked')&lt;/script&gt;

otherwise people could "touch" the stuff in the back.
*/

const UI = (() => {
	
	function escape_html(str) {
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function status_class(s) {
		if (s === "ongoing") return "status_ongoing";
		if (s === "completed") return "status_completed";
		if (s === "hiatus") return "status_hiatus";
		return "";
	}

	// ── Skeletons ────────────────────────────────────
	function show_skeletons(container_id, count = 4) {
		document.getElementById(container_id).innerHTML =
			Array(count).fill(`<div class="skeleton"></div>`).join("");
	}

	// ── Loading / error ──────────────────────────────
	function show_loading(container_id, msg = "Loading…") {
		document.getElementById(container_id).innerHTML =
			`<div class="empty_state"><span class="spinner"></span>${msg}</div>`;
	}

	function show_error(container_id, msg) {
		document.getElementById(container_id).innerHTML =
			`<div class="empty_state"><p>⚠ ${escape_html(msg)}</p></div>`;
	}

	// ── Manga result cards ───────────────────────────
	function render_manga_results(mangas, container_id, { is_bookmarked, on_select, on_bookmark }) {
		const el = document.getElementById(container_id);
		if (!mangas.length) { el.innerHTML = `<div class="empty_state"><p>No results found</p></div>`; return; }

		el.innerHTML = mangas.map(m => `
      <div class="manga_card" data-id="${m.id}">
        ${m.cover
				? `<img class="manga_cover" src="${m.cover}" loading="lazy" onerror="this.style.display='none'" />`
				: `<div class="cover_placeholder">📕</div>`}
        <div class="manga_info">
          <div class="manga_title">${escape_html(m.title)}</div>
          <div class="manga_meta">${m.year || "??"} · ${m.tags.join(", ") || "-"}</div>
          <span class="manga_status ${status_class(m.status)}">${m.status || "unknown"}</span>
        </div>
        <div class="card_actions">
          <button class="bm_btn ${is_bookmarked(m.id) ? "bookmarked" : ""}" data-id="${m.id}">★</button>
        </div>
      </div>`).join("");

		el.querySelectorAll(".manga_card").forEach((card, i) => {
			card.addEventListener("click", e => {
				if (e.target.classList.contains("bm_btn")) return;
				on_select(mangas[i], card);
			});
			card.querySelector(".bm_btn").addEventListener("click", () => on_bookmark(mangas[i]));
		});
	}

	// ── Chapter rows ─────────────────────────────────
	function render_chapter_list(chapters, container_id, { is_read, on_open_sources, manga }) {
		const el = document.getElementById(container_id);
		if (!chapters.length) {
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
        <button class="find_btn">Sources →</button>
      </div>`).join("");

		el.querySelectorAll(".find_btn").forEach((btn, i) => {
			btn.addEventListener("click", e => { e.stopPropagation(); on_open_sources(chapters[i]); });
		});
	}

	// ── Mark a chapter dot as read ───────────────────
	function mark_chapter_read(chapter_num) {
		document.querySelectorAll(".chapter_row").forEach(row => {
			if (row.querySelector(".ch_num")?.textContent.trim() === `Ch. ${chapter_num}`) {
				row.querySelector(".read_dot")?.classList.add("read");
			}
		});
	}

	// ── Refresh bookmark star ────────────────────────
	function refresh_bm_button(manga_id, is_bookmarked) {
		document.querySelectorAll(`.bm_btn[data-id="${manga_id}"]`).forEach(btn => {
			btn.classList.toggle("bookmarked", is_bookmarked);
		});
	}

	// ── Bookmark list ────────────────────────────────
	function render_bookmarks(list, container_id, { on_open, on_remove }) {
		const el = document.getElementById(container_id);

		if (!list.length) {
			el.innerHTML = `<div class="empty_state"><div class="big_icon">🔖</div><p>No bookmarks yet.<br>Search a title and tap the ★ icon.</p></div>`;
			return;
		}

		el.innerHTML = list.map(bm => {
			const pct = bm.total_chapters ? Math.round((bm.read_count / bm.total_chapters) * 100) : 0;
			const sc  = { ongoing: "status_ongoing", completed: "status_completed", hiatus: "status_hiatus" }[bm.status] || "";
			const cover = bm.cover
				? `<img class="manga_cover" src="${bm.cover}" loading="lazy" onerror="this.style.display='none'" />`
				: `<div class="cover_placeholder">📕</div>`;
			return `
			<div class="bm_item">
			  ${cover}
			  <div class="bm_info">
			    <div class="bm_title">${escape_html(bm.title)}</div>
			    <div style="display:flex;align-items:center;gap:8px;margin-top:3px;">
			      <span class="manga_status ${sc}">${bm.status || "unknown"}</span>
			      <span class="bm_meta">${bm.read_count} / ${bm.total_chapters || "?"} read</span>
			    </div>
			    <div class="progress_bar"><div class="progress_fill" style="width:${pct}%"></div></div>
			  </div>
			  <div class="bm_actions">
			    <button class="bm_remove" data-id="${bm.id}">✕</button>
			    <button class="bm_open"   data-id="${bm.id}">Open →</button>
			  </div>
			</div>`;
		}).join("");

		el.querySelectorAll(".bm_open").forEach(btn =>
			btn.addEventListener("click", () => on_open(btn.dataset.id))
		);
		el.querySelectorAll(".bm_remove").forEach(btn =>
			btn.addEventListener("click", () => {
				on_remove(btn.dataset.id);
				render_bookmarks(Bookmarks.get_all(), container_id, { on_open, on_remove });
			})
		);
	}

	return {
		show_skeletons, show_loading, show_error,
		render_manga_results, render_chapter_list, render_bookmarks,
		mark_chapter_read, refresh_bm_button,
		escape_html,
	};

})();
