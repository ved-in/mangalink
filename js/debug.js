const Debug = (
	() => {

		const SOURCES = [ASURASCANS, DEMONICSCANS, ADKSCANS, THUNDERSCANS, TEMPLESCANS];

		const panel  = document.getElementById("debug_panel");
		const title  = document.getElementById("dbg_title");
		const ch     = document.getElementById("dbg_chapter");
		const output = document.getElementById("dbg_output");

		document.getElementById("dbg_check_btn").addEventListener("click", run);
		document.addEventListener(
			"keydown",
			e => {
				if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "d")
				{
					e.preventDefault();
					panel.classList.toggle("open");
				}
			}
		);

		function run()
		{
			const manga   = { id: "__debug__", title: title.value.trim(), mal_id: null, chapters: null };
			const chapter = { chapter: ch.value.trim() || null, title: null };
			if (!manga.title) return;

			output.innerHTML = SOURCES.map(
				src =>
					`
					<div id="dbg_${src.name}">
						${src.icon} <b>${src.name}</b>
						<span id="dbg_b_${src.name}">checking…</span><br>
						<a href="${src.chapter_url(manga, chapter)}" target="_blank">${src.chapter_url(manga, chapter)}</a>
					</div>
					`
			).join("");

			const url_map = Object.fromEntries(SOURCES.map(
				src => [
					src.name,
					src.check_type === "html_alt"
						? {
							type: "html_alt",
							url: src.get_check_url ?
								src.get_check_url(manga, chapter) : src.chapter_url(manga, chapter),
							alt: src.get_alt_text(manga, chapter)
						} 
						: [src.chapter_url(manga, chapter)]

				]
			));

			Checker.check_each(
				url_map,
				(name, status) => {
					const b = document.getElementById(`dbg_b_${name}`);
					if (b) b.textContent = { found: "✓ found", not_found: "✗ not found", unknown: "? unknown" }[status] ?? "?";
				}
			);
		}
		

	}
)();