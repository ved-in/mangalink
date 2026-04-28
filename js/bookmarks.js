const Bookmarks = (
	() => {

		let bookmarks = {};
		let read_log  = {};

		function load()
		{
			bookmarks = Storage.get_bookmarks();
			read_log  = Storage.get_read_log();
		}

		function is_bookmarked(manga_id)
		{
			return !!bookmarks[manga_id];
		}

		function toggle(manga, total_chapters = 0)
		{
			if (bookmarks[manga.id])
			{
				delete bookmarks[manga.id];
			}
			else
			{
				bookmarks[manga.id] = {
					id:             manga.id,
					title:          manga.title,
					cover:          manga.cover,
					status:         manga.status,
					added_at:       Date.now(),
					read_count:     count_read(manga.id),
					total_chapters,
				};
			}
			Storage.save_bookmarks(bookmarks);
			return is_bookmarked(manga.id);
		}

		function remove(manga_id)
		{
			delete bookmarks[manga_id];
			Storage.save_bookmarks(bookmarks);
		}

		function update_total(manga_id, total)
		{
			if (bookmarks[manga_id])
			{
				bookmarks[manga_id].total_chapters = total;
				Storage.save_bookmarks(bookmarks);
			}
		}

		function get_all()
		{
			return Object.values(bookmarks).sort((a, b) => b.added_at - a.added_at);
		}

		function is_chapter_read(manga_id, ch_num)
		{
			return Object.keys(read_log).some(
				k => k.startsWith(`${manga_id}\x00${ch_num}\x00`)
			);
		}

		function was_visited(manga_id, ch_num, site)
		{
			return !!read_log[`${manga_id}\x00${ch_num}\x00${site}`];
		}

		function count_read(manga_id)
		{
			const unique = new Set(
				Object.keys(read_log)
					.filter(k => k.startsWith(manga_id + "\x00"))
					.map(k => k.split("\x00")[1])
			);
			return unique.size;
		}

		function mark_visited(manga_id, ch_num, site)
		{
			read_log[`${manga_id}\x00${ch_num}\x00${site}`] = Date.now();
			Storage.save_read_log(read_log);

			if (bookmarks[manga_id]) {
				bookmarks[manga_id].read_count = count_read(manga_id);
				Storage.save_bookmarks(bookmarks);
			}
		}

		function get_last_read_chapter(manga_id)
		{
			const prefix = manga_id + '\x00';
			let max_ch = null;
			for (const k of Object.keys(read_log)) {
				if (!k.startsWith(prefix)) continue;
				const ch_num = parseFloat(k.split('\x00')[1]);
				if (!isNaN(ch_num) && (max_ch === null || ch_num > max_ch)) {
					max_ch = ch_num;
				}
			}
			return max_ch; // returns null if never read
		}

		return {
			load,
			is_bookmarked,
			toggle,
			remove,
			update_total,
			get_all,
			is_chapter_read,
			was_visited,
			mark_visited,
			get_last_read_chapter,
		};

	}
)();
