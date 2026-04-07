# MangaLink

Don't want to use aggregators BUT also don't want to open up 3 different scanlation sites JUST to find out which one has the chapter you want?

Aggregators like MangaFire or MangaFox just scrape and rehost content from the actual scanlation groups - the groups that translate and clean everything - without giving them any traffic or ad revenue. Reading directly on the scanlators' sites is the least you can do to support the people actually doing the work.
 
The problem is there's no central place to know which scanlator has what. so you end up checking them one by one anyway.

This fixes that. you search a title, pick a chapter, and it tells you where you can read it AND whether the chapter actually exists there or not. bookmarks included.

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
    │   ├── asura.js
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
[ ] Demonicscans is unreliable. See if it has some more different urls for images to make it more consistent. Or there other way im missing. Maybe some pattern in page source?
[ ] Check if Asurascans and ADKscans works as expected with different namings of series
[ ] A direct method to load all sources might be good. Maybe a standard json format where everything is described in json?
[ ] Continue Reading feature
[ ] Clear read history or all bookmarks at once or for particular series
[ ] Add more sources - can refer to some in MangaFox maybe
[ ] Make sources update dynamically (after check, show available or not) and move available ones at top and others at bottom. Show a circle loading animation while different sources are being tested
[ ] After adding MORE scanlation websites, the amount of links to test will increase MUCH (or maybe not, demonicscans might be an exception). A server-side cache?
[ ] On demand source checking to prevent GAZILLIONS of HTTP Requests (maybe its not even a problem?) or source checking depending on genre? Like AsuraScans is THE GOAT for regression, isekai genre so a priority list?
[ ] Make validation of urls client side. It will be much faster. I tried proxies like corsproxy.io but they are pretty slow. Will need to see what can be done.
[ ] Ship it as a website maybe through vercel.

## Long term
[ ] **CANNOT SOLVE RIGHT NOW** - names in Jikan API and scanlations do not match many times. Would be nice if I could find a way but as of now I cannot think of ANYTHING. ORRRRRR maybe we could fetch from the scanlations websites we use so the series available here are definitely available in one of the sources. But that's for later when we make the api
[ ] Ship it as a extension and or... a mobile app?
[ ] I also want to make this a CLI tool (python maybe, or rust?)
[ ] Search by genre, status, year, etc.