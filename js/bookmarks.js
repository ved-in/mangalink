/*
 * bookmarks.js
 *
 * Manages two things:
 *   1. Bookmarks  -- which series the user has starred.
 *   2. Read log   -- which (series, chapter, site) combos they have visited.
 *
 * Both are kept as plain in-memory objects that mirror what is stored in
 * localStorage via Storage. Nothing here talks to localStorage directly.
 *
 * Read-log key format:  "{manga_id}\x00{ch_num}\x00{site}"
 * The null-byte (\x00) separator is used instead of ":" because manga titles
 * can contain colons (e.g. "Re:Zero"), which would make a colon-split ambiguous.
 */

const Bookmarks = (
	() => {

		let bookmarks = {};  // { [manga_id]: bookmark_object }
		let read_log  = {};  // { [key]: Date.now() timestamp }

		// Pull both stores out of localStorage into memory.
		// Call this once on page load before anything else reads bookmarks.
		function load()
		{
			bookmarks = Storage.get_bookmarks();
			read_log  = Storage.get_read_log();
		}

		// Returns true if the given manga is currently bookmarked.
		function is_bookmarked(manga_id)
		{
			return !!bookmarks[manga_id];
		}

		// Add or remove a bookmark. Returns the new bookmarked state (true/false).
		function toggle(manga, total_chapters = 0)
		{
			if (bookmarks[manga.id])
			{
				// Already bookmarked -- remove it.
				delete bookmarks[manga.id];
			}
			else
			{
				// Not bookmarked -- add it with a snapshot of current read progress.
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

		// Remove a bookmark entirely (used by the "X" button in the bookmarks panel).
		function remove(manga_id)
		{
			delete bookmarks[manga_id];
			Storage.save_bookmarks(bookmarks);
		}

		// Update the total chapter count stored on a bookmark.
		// Called after the chapter list is loaded so the progress bar stays accurate.
		function update_total(manga_id, total)
		{
			if (bookmarks[manga_id])
			{
				bookmarks[manga_id].total_chapters = total;
				Storage.save_bookmarks(bookmarks);
			}
		}

		// Return all bookmarks as an array, newest first.
		function get_all()
		{
			return Object.values(bookmarks).sort((a, b) => b.added_at - a.added_at);
		}

		// Returns true if the user has visited ANY site for this chapter.
		// Used to show the green dot on chapter rows.
		function is_chapter_read(manga_id, ch_num)
		{
			return Object.keys(read_log).some(
				k => k.startsWith(`${manga_id}\x00${ch_num}\x00`)
			);
		}

		// Returns true if the user has visited this exact (manga, chapter, site) combo.
		// Used to show the "visited" badge inside the modal.
		function was_visited(manga_id, ch_num, site)
		{
			return !!read_log[`${manga_id}\x00${ch_num}\x00${site}`];
		}

		// Count how many distinct chapters have been read for a given manga.
		// Reads the second segment of each key (between the two null bytes).
		function count_read(manga_id)
		{
			const unique = new Set(
				Object.keys(read_log)
					.filter(k => k.startsWith(manga_id + "\x00"))
					.map(k => k.split("\x00")[1])
			);
			return unique.size;
		}

		// Record that the user clicked a source link for a chapter.
		// Updates the read_log and refreshes the bookmark's read_count.
		function mark_visited(manga_id, ch_num, site)
		{
			read_log[`${manga_id}\x00${ch_num}\x00${site}`] = Date.now();
			Storage.save_read_log(read_log);

			// Keep the bookmark's read_count in sync so the progress bar updates.
			if (bookmarks[manga_id]) {
				bookmarks[manga_id].read_count = count_read(manga_id);
				Storage.save_bookmarks(bookmarks);
			}
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
		};

	}
)();
