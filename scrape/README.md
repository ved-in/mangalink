# scrape/

Node.js scraper that builds the `data/` directory consumed by the front-end.

## Running

```bash
node scrape/scrape.js               # incremental update (normal daily run)
node scrape/scrape.js --status-only # full catalogue status/cover scan (weekly) -> this is meant for updating status of series who are not in the top pages
```

The GitHub Actions workflows in `.github/workflows/` run these automatically.

## Output files

| File | Description |
|------|-------------|
| `data/index.json` | Lightweight array (one small object per series) used by search |
| `data/chunks/chunk_N.json` | Full series data split into 1000-entry files; front-end fetches only the needed chunk |
| `data/scrape_state.json` | Per-series state from the last run; used as baseline for incremental checks |

## Architecture

`scrape.js` is the orchestrator. It runs all scrapers in parallel via `Promise.allSettled`, merges their output, and writes the data files.

```
scrape/
├── scrape.js              # entry point / orchestrator
├── lib/
│   ├── helpers.js         # shared HTTP, text, status, chapter utilities
│   ├── merge.js           # deduplication and merge logic
│   ├── state.js           # scrape_state.json load/save/build
│   └── wp-theme.js        # shared engine for WordPress manga theme sites
└── sources/
    ├── adk/               # ADK Scans (silentquill.net) — WP theme, status-filtered listing
    ├── asura/             # Asura Scans — JSON REST API
    ├── demonic/           # Demonic Scans — paginated HTML listing
    ├── flame/             # Flame Comics — Next.js API with per-chapter hex tokens
    ├── mangaplus/         # MangaPlus — protobuf binary API
    ├── temple/            # Temple Toons — Next.js embedded JSON, all chapters stored
    ├── thunder/           # Thunder Scans — WP theme
    └── violet/            # Violet Scans — WP theme
```

## Adding a new source

1. Create `scrape/sources/{name}/index.js` exporting a `scrape_{name}(opts)` async function.
2. Add it to the `SCRAPERS` array in `scrape.js`.
3. Add a `SRC_CODE` entry in `scrape.js` and a matching entry in `js/api.js`'s `SRC_NAME`.
4. Create a front-end source object in `js/sources/{name}.js` following `js/sources/sample.js`.
5. Register it in `js/modal.js`'s `SOURCE_MAP`.

## Incremental mode

Scrapers compare the current run's data against `scrape_state.json`. For HTML scrapers, the state is keyed by series slug; for API scrapers, by normalised title. A series is re-fetched only when its `max_chapter` or `chapter_count` increased. The `uf` field records the run number at which a series last gained new chapters — the front-end uses this as the primary "recently updated" sort key.
