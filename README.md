# MangaLink

Aggregator sites are a problem. They scrape chapters from scanlation groups - the people actually doing the translation work - and rehost everything on their own site, stealing the traffic and ad revenue those groups depend on to keep running.

Imagine you having to read MTLs because the group which translated for you is now shut down. Painful right?

But the alternative (bookmarking six different scanlator sites and checking each one manually) is genuinely painful.

MangaLink is a middle ground. It doesn't host any content. It just checks some of the sites if they have the chapter/serues you're looking for and gives you a direct link to go read it there - on the scanlators' own sites, with their own ads, supporting their work.

Aggregators are going to be added for the users which use ad-blockers or the series they want to watch is not available in currently added scanlators/official sources. If you are able to deduce the source while reading, feel free to open up an issue on github regarding it. We also check for `ad-blockers` so scanlators are HIDDEN to ad-block users.

**[→ Try it live](https://ved-in.github.io/mangalink/)**

---

## What it does

Search any manga or manhwa title and MangaLink will:

- Show you which scanlator sites have it
- Give you a direct link to each available chapter
- Track what you've read and let you bookmark series (stored in localStorage)

---

## Supported sources

| Source | Type |
|---|---|
| [Asura Scans](https://asuracomic.net/) | Scanlator |
| [Demonic Scans](https://demonicscans.org/) | Scanlator |
| [Flame Comics](https://flamecomics.xyz/) | Scanlator |
| [Thunder Scans](https://thunderscans.net/) | Scanlator |
| [Temple Toons](https://templetoons.com/) | Scanlator |
| [Violet Scans](https://violetscans.com/) | Scanlator |
| [ADK Scans / SilentQuill](https://silentquill.net/) | Scanlator |
| [MANGA Plus](https://mangaplus.shueisha.co.jp/updates/) | Official |

Want a source added? [Open an issue](https://github.com/ved-in/mangalink/issues/new?template=new_source.md).

---

## Local setup

```bash
npm install
```
For testing it locally, edit the `config.json` to set the `base` key to `""` whil commiting changes, set it to `mangalink/` (for github pages)

Then open `index.html` with a local server. Live Server in VS Code works great, or:

```bash
npx serve .
```

> The app is fully static - no backend required. Chapter availability is checked client-side via each source's own URLs.

---

## Adding a new source

Adding a source involves two parts: the **frontend source** (builds URLs, tells the app how to check chapter availability) and the **scraper** (pulls series metadata so the source appears in search results). If you find having to repeat a function which already exists in some other scraper, feel free to add it to `scrape/lib/` for easy editing later on.

### 1. Frontend source (`js/sources/`)

Copy `js/sources/sample.js` and implement:

- `name` - display name shown in the UI
- `series_url(manga)` - URL to the series page
- `chapter_url(manga, chapter)` - URL to a specific chapter; use `chapter.chapter_slugs?.["Your Source Name"]` when the site uses non-standard slugs
- `check_type` / `get_test_urls()` / `get_alt_text()` - how the checker should verify the chapter exists (see `sample.js` for options)
- `_to_slug(title)` - title-to-URL-slug conversion; adjust per site

Then register it in `index.html` (before `modal.js`) and add it to `ALL_SOURCES` in `js/modal.js`.

### 2. Scraper (`scrape/sources/`)

Create a folder under `scrape/sources/your_source/`. The scraper runs on a schedule via GitHub Actions and populates `data/index.json` - this powers search. Each series object looks like:

```js
{
  title: "Series Title",
  slug: "series-slug",
  cover: "https://...",
  sources: ["Your Source"],
  max_chapter: 42,
  status: "ongoing",
  chapter_slugs: {
    "Your Source": { "1.5": "chapter-1-5" }  // only for non-integer chapters
  }
}
```

Use the helpers from `scrape/lib/helpers.js` (`fetch_html`, `sleep`, `normalise_title`, etc.), then import and call your scraper in `scrape/scrape.js`.

> Note: Only store `chapter_slugs` when chapters aren't natural numbers (1, 2, 3…). See `flame` for an example with hex-based chapter IDs.

---

## File structure

```
mangalink/
├── index.html               ← homepage / landing
├── search-result.html       ← search & chapter browser
├── bookmark.html            ← bookmarks page
├── package.json
│
├── css/
│   ├── home.css             ← landing page styles
│   ├── search.css           ← search results page styles
│   └── bookmark.css         ← bookmarks page styles
│
├── js/
│   ├── app.js               ← main controller, routing, search
│   ├── api.js               ← index search + chapter data
│   ├── checker.js           ← client-side chapter availability checks
│   ├── modal.js             ← sources modal, ALL_SOURCES registry
│   ├── bookmarks.js         ← bookmark + read tracking state
│   ├── storage.js           ← localStorage persistence
│   ├── ui.js                ← DOM rendering helpers
│   └── sources/
│       ├── sample.js        ← template - start here for new sources
│       ├── utils.js         ← shared slug/URL helpers
│       ├── asura.js
│       ├── thunder.js
│       ├── temple.js
│       ├── flame.js
│       ├── violet.js
│       ├── demonic.js
│       └── adk.js
│
├── scrape/
│   ├── scrape.js            ← entry point: runs all scrapers, writes data/
│   ├── lib/
│   │   ├── helpers.js       ← shared fetch, sleep, dedup utils
│   │   └── merge.js         ← index merging logic
│   └── sources/
│       ├── asura/
│       ├── thunder/
│       ├── temple/
│       ├── flame/
│       ├── violet/
│       ├── demonic/
│       └── adk/
│
├── data/
│   ├── index.json           ← full series index (auto-generated)
│   ├── scrape_state.json    ← scraper state for incremental updates
│   └── chunks/              ← index split into chunks for faster loading
│
└── public/
    └── ...                  ← images and icons
```

---

## How the scraper works

Two GitHub Actions jobs keep the data fresh:

**Quick update** (every 2 hours) - runs `node scrape/scrape.js --quick`. Each scraper stops as soon as it hits a streak of unchanged series, so only a small fraction of the catalogue is fetched per run. New chapters and status changes appear within hours.

The scraper writes to `data/index.json` and `data/chunks/`, then commits back to the repo. GitHub Pages redeploys automatically.

---

## To-do

**Bugs**
- [x] Icons of series are cutoff in the `chapters_panel`. Relevant file -> `bookmark.html`, `search-result.html` (apologies for the messy structure)

**UI**
- [ ] Fix bookmark page. Use the construct in homepage's `Recently Updated` or `Currently Reading` sections.
- [ ] Fix profile page layout... really... really evident when you visit it

**QOL**
- [ ] Completely remove `--status-only` flag from scraper. Better way is just to delete the entire `data/` folder and rebuild it which I've implemented. Makes it messy and complicated for no real reason.
- [ ] Instead of multiple objects related to mapping of sources in different files (i.e., `js/modal.js`, `scrape/scrape.js`), create a `sources.json` file which is used instead. Would make addition of new sources a lot easier. It could have objects like
```json
{
  "comic_sources": [
    {
      "source": "Asura Scans",
      "alias": "A",
      "object": "ASURASCANS"
    },
    {
      "source": "ADK Scans",
      "alias": "D",
      "object": "ADKSCANS"
    }
  ]
}
```
- [ ] Fix the messy code a little....

**New sources requested**
- [ ] Drake Scans ([#26](https://github.com/ved-in/mangalink/issues/26))
- [ ] Weeb Central ([#3](https://github.com/ved-in/mangalink/issues/3))
- [ ] Vortex Scans ([#8](https://github.com/ved-in/mangalink/issues/8))
- [ ] Reset Scans ([#7](https://github.com/ved-in/mangalink/issues/7))
- [ ] MangaNato ([#10](https://github.com/ved-in/mangalink/issues/10))
- [ ] MangaBat ([#9](https://github.com/ved-in/mangalink/issues/9))
- [ ] MangaZ ([#4](https://github.com/ved-in/mangalink/issues/4))
- [ ] Valir Scans ([#6](https://github.com/ved-in/mangalink/issues/6)) - Unable to implement as of now due to cloudfare.

**Features**
- [ ] Clear read history / bookmarks (per-series or all at once)
- [x] Recently updated section in home-page
- [ ] Notifications based on chapter updates of bookmarked series.
- [ ] Filter by genre, status, year (I forgot about genre and year... Have to edit scrapers again.. GAH)
- [ ] GitHub link and About page ([#14](https://github.com/ved-in/mangalink/issues/14))
- [x] Aggregator toggle - let users choose scanlators only, aggregators only, or both (with ad-blocker disclaimer) -> current implementation is good. If adblocker detected, wont show scanlators. if not, then it will show all three different source types (scanlators, official, aggregators)
- [ ] Cross-device sync (accounts)
- [ ] MAL export

**Scraper**
- [ ] Find a workaround/replacement for series cover present on MangaPlus. eg., [this](https://jumpg-assets.tokyo-cdn.com/secure/title/100628/title_thumbnail_portrait_list/456823.jpg), which results in a 403 status code (forbidden) on visiting.
- [ ] Some series with `null` status still exists. See the issue and fix accordingly.

**Long term**
- [ ] Sync user's reading progress and bookmarks across devices (login required)
- [ ] Mobile app
- [ ] CLI tool

---

## Removal / takedown

If you're the owner of a scanlation group listed here and want it removed, [open an issue](https://github.com/ved-in/mangalink/issues) and it'll be done promptly.

---

## License

MIT