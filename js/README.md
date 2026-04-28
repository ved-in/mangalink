# js/

Front-end JavaScript modules. Load order matters - each file depends on those above it.

**Load order** (as declared in `index.html`):
1. `config.js` - must be first; reads `config.json` synchronously and exposes `window.BASE`
2. `js/sources/utils.js` - shared helpers (`slugify`, `url_last_segment`)
3. `js/sources/*.js` - one object per scan source (ASURASCANS, ADKSCANS, etc.)
4. `storage.js` - `localStorage` wrapper
5. `api.js` - data loading: index, chunk fetching, search, recently-updated
6. `checker.js` - chapter URL existence checks via CORS proxies
7. `ui.js` - pure DOM rendering functions
8. `modal.js` - the "Sources" modal for a chapter
9. `bookmarks.js` - bookmark and read-log management
10. `app.js` - entry point; wires everything together

## Files

| File | Purpose |
|------|---------|
| `config.js` Loads `config.json`; sets `window.BASE`; required for testing vs deployment |
| `api.js` | Loads `data/index.json` and chunk files; runs the tiered search algorithm |
| `app.js` | DOM init, event wiring, search flow, manga/chapter selection, bookmark rendering |
| `bookmarks.js` | In-memory bookmark + read-log state, backed by `Storage` |
| `checker.js` | Proxied HEAD/HTML checks to verify chapter URLs exist |
| `modal.js` | Sources modal: section layout, adblock-aware ordering, badge updates |
| `nav.js` | Injects the topbar HTML, wires dropdown/search/random-manga |
| `storage.js` | `get`/`set` wrappers around `localStorage` |
| `ui.js` | Stateless render functions (results, chapters, bookmarks, skeletons) |
| `adblock.js` | Wraps `AdBlockChecker.checkAdBlock()`; returns `true` if blocked |

## js/sources/

One file per manga source. Each exports a plain object with `name`, `type`, `series_url()`, and `chapter_url()`. See `sample.js` for the full interface.

Source codes used in `data/index.json`: `A`=Asura, `D`=ADK, `T`=Thunder, `P`=Temple, `M`=Demonic, `F`=Flame, `V`=Violet, `J`=MangaPlus.
