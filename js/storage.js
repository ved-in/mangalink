/*
 * storage.js
 *
 * Thin wrapper around localStorage so the rest of the app never
 * touches localStorage directly. All keys are namespaced under
 * "manga_link:" to avoid collisions with anything else on the domain.
 *
 * Two separate stores:
 *   bookmarks  -- { [manga_id]: bookmark_object }
 *   read_log   -- { [manga_id\x00ch_num\x00site]: timestamp }
 *
 * The read_log uses null-byte separators in its keys so titles
 * containing colons (e.g. "Re:Zero") never cause a parse ambiguity.
 *
 * Both get/set silently swallow errors so a full localStorage quota
 * never crashes the app -- it just stops persisting.
 */

const Storage = (
	() => {

		// Parse a stored JSON string. Returns null if missing or malformed.
		function get(key)
		{
			try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
		}

		// Stringify and store a value. Silently drops write errors (e.g. quota exceeded).
		function set(key, value)
		{
			try { localStorage.setItem(key, JSON.stringify(value)); } catch { }
		}

		return {
			get_bookmarks()        { return get("manga_link:bookmarks") || {}; },
			save_bookmarks(data)   { set("manga_link:bookmarks", data); },

			get_read_log()         { return get("manga_link:read_log") || {}; },
			save_read_log(data)    { set("manga_link:read_log", data); },
		};

	}
)();
