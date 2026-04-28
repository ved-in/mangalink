const UI = (() => {

	function escape_html(str) {
		return String(str)
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;");
	}

	function status_class(s) {
		if (s === "ongoing")   return "status_ongoing";
		if (s === "completed") return "status_completed";
		if (s === "hiatus")    return "status_hiatus";
		if (s === "dropped")   return "status_dropped";
		return "";
	}

	function show_skeletons(container_id, count = 4) {
		document.getElementById(container_id).innerHTML =
			Array(count).fill(`<div class="skeleton"></div>`).join("");
	}

	function show_loading(container_id, msg = "Loading...") {
		document.getElementById(container_id).innerHTML =
			`<div class="empty_state"><span class="spinner"></span>${msg}</div>`;
	}

	function show_error(container_id, msg) {
		document.getElementById(container_id).innerHTML =
			`<div class="empty_state"><p> ${escape_html(msg)}</p></div>`;
	}

	function render_manga_results(mangas, container_id, { is_bookmarked, on_select, on_bookmark }) {
		const el = document.getElementById(container_id);
		if (!mangas.length) {
			el.innerHTML = `<div class="empty_state"><p>No results found</p></div>`;
			return;
		}

		el.innerHTML = mangas.map(m => `
			<div class="ru-card" data-id="${escape_html(m.id)}">
				<div class="ru-cover">
					${m.cover
						? `<img src="${m.cover}" loading="lazy" onerror="this.style.display='none'" alt="" />`
						: `<div class="ru-cover-placeholder"></div>`}
				</div>
				<div class="ru-info">
					<div class="ru-type">${escape_html(m.status || "unknown")}</div>
					<div class="ru-title">${escape_html(m.title)}</div>
					<div class="ru-chapters">
						<div class="ru-ch">
							<span class="ru-ch-num">${m.max_chapter ? `Ch. ${m.max_chapter}` : "—"}</span>
						</div>
					</div>
				</div>
			</div>`).join("");

		el.querySelectorAll(".ru-card").forEach((card, i) => {
			card.addEventListener("click", () => on_select(mangas[i], card));
		});
	}

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

		const BATCH = 80;
		let rendered = 0;

		function append_batch() {
			const batch = chapters.slice(rendered, rendered + BATCH);
			if (!batch.length) return;
			const frag = document.createDocumentFragment();
			batch.forEach((ch, bi) => {
				const idx = rendered + bi;
				const row = document.createElement('div');
				row.className = 'chapter_row';
				row.innerHTML = `
					<span class="read_dot ${is_read(ch.chapter) ? 'read' : ''}"></span>
					<span class="ch_num">${ch.chapter ? `Ch. ${ch.chapter}` : 'Oneshot'}</span>
					<span class="ch_title">${ch.title ? `- ${escape_html(ch.title)}` : ''}</span>
					<button class="find_btn">Sources</button>`;
				row.querySelector('.find_btn').addEventListener('click', e => {
					e.stopPropagation();
					on_open_sources(chapters[idx]);
				});
				frag.appendChild(row);
			});
			rendered += batch.length;
			el.appendChild(frag);
			if (rendered < chapters.length) {
				function on_scroll() {
					if (el.scrollTop + el.clientHeight >= el.scrollHeight - 300) {
						el.removeEventListener('scroll', on_scroll);
						append_batch();
					}
				}
				el.addEventListener('scroll', on_scroll);
			}
		}

		el.innerHTML = '';
		append_batch();
	}

	function mark_chapter_read(chapter_num) {
		document.querySelectorAll(".chapter_row").forEach(row => {
			if (row.querySelector(".ch_num")?.textContent.trim() === `Ch. ${chapter_num}`) {
				row.querySelector(".read_dot")?.classList.add("read");
			}
		});
	}

	function refresh_bm_item(manga_id, read_count, total_chapters) {
		const item = document.querySelector(`.bm_item[data-id="${manga_id}"]`);
		if (!item) return;
		const pct  = total_chapters ? Math.round((read_count / total_chapters) * 100) : 0;
		const meta = item.querySelector('.bm_meta');
		const fill = item.querySelector('.progress_fill');
		if (meta) meta.textContent = `${read_count} / ${total_chapters || '?'} read`;
		if (fill) fill.style.width = `${pct}%`;
	}

	function refresh_bm_button(manga_id, is_bm) {
		document.querySelectorAll(`.bm_btn[data-id="${manga_id}"], .panel-bm-btn`).forEach(btn => {
			btn.classList.toggle("bookmarked", is_bm);
		});
	}

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
				render_bookmarks(Bookmarks.get_all(), container_id, { on_open, on_remove });
			})
		);
	}

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
		refresh_bm_item,
		escape_html,
	};

})();