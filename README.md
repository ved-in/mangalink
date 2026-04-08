# MangaLink

Many people, like me end up jumping between multiple websites just to find a single chapter or the manga/manhwa saw on instagram.. One site might have it, another might not, another might be broken - and you don’t know until you check each one.

There *are* sites that collect everything in one place, but they copy content from the fan translation groups (scanlator groups) without supporting them stealing their possible ad revenue and site traffic (aggregators)

This tool helps you skip all that hassle.

Just search for a series, choose the chapter you want, and it will show you:

* Which websites actually have that chapter
* Whether the chapter is available there or not
* Quick links so you can go straight to it
* Bookmark support and tracking of read chapters so you can save what you're reading

(uses localStorage, not persistent across devices atm)

No more opening multiple tabs just to find one chapter.

If you would like to get a scanlation added, create an issue.

## Setup

### 1. Install dependencies
```
npm install
```

### 2. Start the proxy server
```
node server.js
```
The proxy runs on `http://localhost:3000` and checks whether a chapter
actually exists on each source site before showing it to you.

### 3. Open the app
Open `index.html` in your browser (use Live Server in VS Code, or just double-click it).

### Debug
Jikan api does not contain majority of the series in the scanlations website. Till the time a proper API is made WHICH directly scrapes series details from these sites, u can use the debug panel `(ctrl+shift+D)` for testing sources.

---

## Adding a new source
1. Create `js/sources/your_source.js` following the pattern in `js/sources/sample.js`.
2. Add `<script src="js/sources/your_source.js"></script>` in `index.html` before `modal.js`.
3. Add `your_source` to the `ALL_SOURCES` array in `js/modal.js`.

## File structure
```
manga_link/
├── index.html
├── server.js          <- Node proxy (chapter existence checking)
├── package.json
├── css/
│   └── styles.css
└── js/
    ├── sources/
    │   ├── sample.js  <- template for sources
    │   ├── asura.js
    │   ├── thunder.js
    │   ├── adk.js
    │   └── demonic.js
    ├── storage.js     <- localStorage persistence
    ├── api.js         <- Jikan/MAL data fetching
    ├── checker.js     <- proxy client (chapter existence)
    ├── ui.js          <- DOM rendering helpers
    ├── modal.js       <- sources modal
    ├── bookmarks.js   <- bookmark + read tracking state
    └── app.js         <- main controller
```

## Removal/Addition Of Source:
If you are the owner of the particular scanlations this project links to and want it removed from here, create an `Issue` regarding it and it will be done.

Similarly if you want a scanlation to be added, u may create a new issue.

## ToDo
[x] Demonicscans is unreliable. See if it has some more different urls for images to make it more consistent. Or there other way im missing. Maybe some pattern in page source? (done, the alt param of elements in page source of chapters had a pattern. using that)

[x] Check if Asurascans and ADKscans works as expected with different namings of series

[ ] A direct method to load all sources might be good. Maybe a standard json format where everything is described in json?

[ ] Continue Reading feature

[ ] Clear read history or all bookmarks at once or for particular series

[ ] Add more sources - can refer to some in MangaFox maybe\

[x] Make sources update dynamically (after check, show available or not) and move available ones at top and others at bottom. Show a circle loading animation while different sources are being tested

[ ] After adding MORE scanlation websites, the amount of links to test will increase MUCH (or maybe not, demonicscans might be an exception). A server-side cache?

[x] On demand source checking to prevent GAZILLIONS of HTTP Requests (maybe its not even a problem?) or source checking depending on genre? Like AsuraScans is THE GOAT for regression, isekai genre so a priority list? (no need)

[ ] Make validation of urls client side. It will be much faster. I tried proxies like corsproxy.io but they are pretty slow. Will need to see what can be done.

[x] Ship it as a website maybe through vercel. (done, through github pages)

## Long term
[ ] **CANNOT SOLVE RIGHT NOW** - names in Jikan API and scanlations do not match many times. Would be nice if I could find a way but as of now I cannot think of ANYTHING. ORRRRRR maybe we could fetch from the scanlations websites we use so the series available here are definitely available in one of the sources. But that's for later when we make the api

[ ] Ship it as a extension and or... a mobile app?

[ ] I also want to make this a CLI tool (python maybe, or rust?)

[ ] Search by genre, status, year, etc.