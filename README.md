# MangaLink

Aggregator sites are a problem. They scrape chapters from scanlation groups - the people actually doing the translation work - and rehost everything on their own site, stealing the traffic and ad revenue those groups depend on to keep running.

Imagine you having to read MTLs because the group which translated for you is now shut down. Painful right?

But the alternative (bookmarking six different scanlator sites and checking each one manually) is genuinely painful.

MangaLink is a middle ground. It doesn't host any content. It just checks some of the scanlator sites if they have the chapter/serues you're looking for and gives you a direct link to go read it there - on the scanlators' own sites, with their own ads, supporting their work.

Just search for a series, pick a chapter, and MangaLink shows you:

* Which scanlator sites have that chapter
* A direct link straight to it
* Bookmark and read-tracking support so you can pick up where you left off (no continue reading feature for now)

(read tracking uses localStorage - not synced across devices yet. Will add an account feature)

We will be adding aggregators as a source option because you cannot really add ALL the scanlations so many of the series/chapters u want to read may not e available. But currently there are no aggregators added.

We will also add a feature which detects if you use an ad blocker and depending on its response, you will only be seeing the aggregators. Sending traffic to scanlators when you are using ad-blockers is destructive.

If you want a scanlation group added, open an issue.

---

## Setup

### 1. Install dependencies
```
npm install
```

### 2. Start the proxy server
```
node server.js
```
The proxy runs on `http://localhost:3000`. It verifies chapter availability server-side and enforces a host allowlist - only the scanlator domains this project explicitly supports can be reached through it.

### 3. Open the app
Open `index.html` in your browser (Live Server in VS Code works great, or just double-click it).

### Debug panel
The Jikan/MAL API doesn't cover most series that scanlators work on. Until a proper scraper-based search API exists, you can use the debug panel (`Ctrl+Shift+D`) to test sources directly.

---

## Adding a new source

Adding a source involves two parts: the **frontend source** (builds URLs, tells the app how to check availability) and the **scraper** (pulls series metadata so the source appears in search results).

### 1. Frontend source (`js/sources/`)

Create `js/sources/your_source.js` following the pattern in `js/sources/sample.js`. Key things to implement:

- `name` - display name shown in the UI
- `series_url(manga)` - URL to the series page
- `chapter_url(manga, chapter)` - URL to a specific chapter; use `chapter.chapter_slugs?.["Your Source Name"]` when the site uses non-standard slugs
- `check_type` / `get_test_urls()` / `get_alt_text()` - how the proxy should verify the chapter exists (see `sample.js` for options)
- `_to_slug(title)` - title-to-URL-slug conversion, adjust per site

Then wire it up in `index.html`:
```html
<script src="js/sources/your_source.js"></script>  <!-- before modal.js -->
```

And add it to `ALL_SOURCES` in `js/modal.js`.

Finally, add the source's hostname(s) to the `ALLOWED_HOSTS` set in `server.js` so the proxy will allow requests to it.

### 2. Scraper (`scrape/sources/`)

Create `scrape/sources/your_source.js`. The scraper runs on a schedule (via GitHub Actions) and populates `data/series.json` - this is what powers search. Each series object has a generic structure:

```js
{
  title: "Series Title",
  slug: "series-slug",        // used for deduplication
  cover: "https://...",
  sources: { "Your Source": "https://yoursite.com/manga/series-slug" },
  max_chapter: 42,
  chapters: {
    "Your Source": [
      { name: "1.5", chapter_slug: "chapter-1-5" },  // only needed for non-integer or slug-dependent chapters
    ]
  }
}
```

Use the helpers from `scrape/sources/helpers.js` (`fetch`, `sleep`, `decode_html_entities`, `add_cards`)

Then import and call your scraper in `scrape/scrape.js` alongside the others.

Note: Refer to the different scrapers before adding one. You can modify the structure however you like for eg., `flame_series_id` used for flamescans. Try not to store chapter_slugs for all the series if possible. BUT YOU WILL HAVE TO STORE THEM FOR CHAPTERS WHCIH ARE NOT NATURAL NUMBERS (1, 2, 3...). However if necessary, you can. For eg., `flamescans` having weird hexes for chapters.

---

## File structure
```
mangalink/
├── index.html
├── server.js                  ← Node proxy: chapter availability + host allowlist
├── package.json
│
├── css/
│   └── styles.css
│
├── js/
│   ├── app.js                 ← main controller
│   ├── api.js                 ← series/chapter data + chapter slug resolution
│   ├── checker.js             ← proxy client (chapter existence checks)
│   ├── modal.js               ← sources modal, ALL_SOURCES registry
│   ├── bookmarks.js           ← bookmark + read tracking state
│   ├── storage.js             ← localStorage persistence
│   ├── ui.js                  ← DOM rendering helpers
│   └── debug.js               ← debug panel (Ctrl+Shift+D)
│   └── sources/
│       ├── sample.js          ← template - start here for new sources
│       ├── asura.js           ← Asura Scans
│       ├── thunder.js         ← Thunder Scans
│       ├── temple.js          ← Temple Toons
│       ├── flame.js           ← Flame Comics
│       ├── violet.js          ← Violet Scans
│       ├── demonic.js         ← Demonic Scans
│       └── adk.js             ← ADK Scans (SilentQuill)
│
└── scrape/
    ├── scrape.js              ← entry point: runs all scrapers, merges, writes series.json
    └── sources/
        ├── helpers.js         ← shared fetch, sleep, HTML entity decode, dedup utils
        ├── asura.js
        ├── thunder.js
        ├── temple.js
        ├── flame.js
        ├── violet.js
        ├── demonic.js
        └── adk.js
```

---

## Removal / addition of a source

If you're the owner of a scanlation group linked here and want it removed, open an issue and it'll be done promptly.

If you want your scanlation group added, open an issue.

---

## ToDo
[x] Add Temple Scans

[x] Fetch titles and covers from scanlators and search only within them

[x] Server-side cache

[x] Proxy with fallback to CORS proxy for client-side requests

[x] UptimeRobot pinging to keep Render backend alive

[x] Fix Temple Toons chapter URL prefixes (e.g. `84459-chapter-6`)

[x] Add GitHub Actions workflow to refresh series list (runs every 2 hours)

[x] Support decimal chapters (1.1, 1.2, 1.5, etc.)

[x] Add Violet Scans

[ ] Replace `?? - -` in cards to show max chapter and `UNKNOWN` to show current status. Like `hiatus`, `drop`, `ongoing`, etc. May remove it if cannot get current status.

[ ] Use proxies to check chapter lists which run parallely. Will be much faster this way

[ ] Continue Reading feature

[ ] Clear read history / bookmarks (per-series or all at once)

[ ] ask users to choose either of 3 options - show only aggregators, only scanlators, both aggregators and scanlators WITH disclaimer for not using ad blockers with scanlators

[ ] Filter by genre, status, year, etc.

[ ] Add Vortex Scans `https://vortexscans.org/`

[ ] Add Reset Scans `https://reset-scans.org/`

[ ] Add Valir Scans `https://valirscans.org/`


## Long term
[ ] Series names in Jikan API often don't match scanlator slugs - no clean fix yet. Ideally, search would be driven entirely by scraped data from the scanlators themselves.

[ ] Browser extension

[ ] Mobile app

[ ] CLI tool (Python or Rust, might take this chance to learn rust)