(function () {
  // Derive BASE from the current page's path so this works on both
  // localhost (BASE='') and GitHub Pages (BASE='/mangalink') with no config needed.
  //
  // Strategy: walk up from the current pathname until we find the segment
  // that contains our known HTML files (index, search-result, bookmark, etc).
  // Everything before that segment is the BASE prefix.
  //
  // e.g. /mangalink/search-result.html → BASE = '/mangalink'
  //      /index.html                   → BASE = ''
  //      /                             → BASE = ''

  const known = ['index.html', 'search-result.html', 'bookmark.html',
                 'profile.html', 'notifications.html'];

  const path = window.location.pathname; // e.g. '/mangalink/search-result.html'

  let base = '';
  for (const file of known) {
    const idx = path.lastIndexOf('/' + file);
    if (idx !== -1) {
      base = path.slice(0, idx); // everything before '/filename.html'
      break;
    }
  }

  // If we're at a bare directory (e.g. /mangalink/ or /), strip trailing slash
  if (base === '' && path !== '/' && path.endsWith('/')) {
    base = path.slice(0, -1);
  }

  window.BASE = base;
})();
