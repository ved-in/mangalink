# scrape/sources/

One directory per manga source. Each contains an `index.js` that exports a single `scrape_*()` async function.

| Source | Site | Method | Notes |
|--------|------|--------|-------|
| `adk/` | silentquill.net | WP theme (3× status filters) | Uses `lib/wp-theme.js`; fetches ongoing/completed/hiatus lists separately |
| `asura/` | asurascans.com | JSON REST API | `api.js` handles pagination + chapter fetches |
| `demonic/` | demonicscans.org | Paginated HTML | `listing.js` parses cards; `chapters.js` fetches non-integer chapters |
| `flame/` | flamecomics.xyz | Next.js API | Requires dynamic `buildId` from homepage; stores all chapter hex tokens |
| `mangaplus/` | mangaplus.shueisha.co.jp | Protobuf binary API | Decoded protobuf; `api.js` contains full wire-format parser |
| `temple/` | templetoons.com | Next.js embedded JSON | Entire catalogue in one request; regex extraction due to double-escaped JSON |
| `thunder/` | en-thunderscans.com | WP theme | Config-only; delegates fully to `lib/wp-theme.js` |
| `violet/` | violetscans.org | WP theme | Config-only; delegates fully to `lib/wp-theme.js` |

All scrapers accept `{ state, run, status_only }` and return a series array for `lib/merge.js`.
