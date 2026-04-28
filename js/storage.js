const Storage = (
	() => {

		function get(key)
		{
			try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
		}

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
