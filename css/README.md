# css/

Stylesheets for the front-end. Every page imports `base.css` plus one page-specific file.

| File | Used by | Purpose |
|------|---------|---------|
| `base.css` | All pages | Design tokens (colors, fonts, spacing), reset, topbar, modal, shared components |
| `home.css` | `index.html` | Hero section, search bar, recently-updated grid |
| `panel.css` | `search-result.html`, `bookmark.html` | Two-panel layout (results list + chapter panel) |
| `nav.css` | *(deprecated)* | Re-exports `base.css` for backwards compatibility - do not add styles here |
| `search.css` | *(deprecated)* | Re-exports `panel.css` - do not add styles here |
| `bookmark.css` | *(deprecated)* | Re-exports `panel.css` - do not add styles here |

## Design tokens

All CSS custom properties are defined in `base.css` under `:root`. Key tokens:

- `--bg`, `--surface`, `--surface2`, `--card` - background layers
- `--ink`, `--ink-soft`, `--ink-muted` - text colors
- `--accent`, `--accent2` - primary red brand color
- `--col-official`, `--col-fantl`, `--col-aggr` - source type colors
- `--sans`, `--mono`, `--display` - font stacks
- `--radius`, `--radius-lg` - border radii
- `--nav-h` - topbar height (used for `padding-top` on inner pages)
