(function () {
  const B = window.BASE || '';

  const NAV_HTML = `
<div class="topbar" id="topbar">
  <div class="topbar-inner">
    <a href="${B}/" class="nav-logo">Manga<span>Link</span></a>
    <nav>
      <ul class="nav-links">
        <li class="has-dropdown">
          <button>Types<svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="dropdown-menu">
            <div class="dropdown-menu-inner">
              <a href="${B}/search-result.html">Manga</a>
              <a href="${B}/search-result.html">Manhwa</a>
              <a href="${B}/search-result.html">Manhua</a>
              <a href="${B}/search-result.html">One-Shot</a>
              <a href="${B}/search-result.html">Novel</a>
              <a href="${B}/search-result.html">Doujinshi</a>
            </div>
          </div>
        </li>
        <li class="has-dropdown">
          <button>Genres<svg class="chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg></button>
          <div class="dropdown-menu">
            <div class="dropdown-menu-inner" style="display:grid;grid-template-columns:repeat(3,1fr);min-width:360px">
              <a href="#">Action</a><a href="#">Adventure</a><a href="#">Comedy</a>
              <a href="#">Drama</a><a href="#">Fantasy</a><a href="#">Horror</a>
              <a href="#">Isekai</a><a href="#">Josei</a><a href="#">Mecha</a>
              <a href="#">Mystery</a><a href="#">Parody</a><a href="#">Romance</a>
              <a href="#">School</a><a href="#">Sci-Fi</a><a href="#">Seinen</a>
              <a href="#">Shounen</a><a href="#">Slice of Life</a><a href="#">Sports</a>
            </div>
          </div>
        </li>
        <li><a href="${B}/search-result.html">Browse</a></li>
        <li><a href="${B}/bookmark.html">Bookmarks</a></li>
        <li>
          <a href="#" id="random-manga-btn" title="Random Manga">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg>
            Random
          </a>
        </li>
      </ul>
    </nav>

    <div class="nav-search" id="nav-search-wrap">
      <svg class="nav-search-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      <input type="text" class="nav-search-input" id="nav-search-input" placeholder="Search manga..." autocomplete="off" />
      <div class="nav-suggestions" id="nav-suggestions"></div>
    </div>

    <div class="nav-right">
      <a href="${B}/notifications.html" class="nav-icon-btn" title="Notifications" id="notif-btn">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
        <span class="badge" id="notif-badge" style="display:none">0</span>
      </a>
      <a href="${B}/bookmark.html" class="nav-icon-btn" title="Bookmarks">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
      </a>
      <div class="user-dropdown-wrap" id="user-dropdown-wrap">
        <button class="user-avatar-btn" id="user-avatar-btn" title="My Account">R</button>
        <div class="user-dropdown" id="user-dropdown">
          <div class="user-dropdown-header">
            <span class="user-dropdown-name">Reader</span>
            <span class="user-dropdown-email">local · no account</span>
          </div>
          <div class="user-dropdown-links">
            <a href="${B}/profile.html">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Profile
            </a>
            <a href="${B}/bookmark.html">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
              Bookmarks
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;

  document.body.insertAdjacentHTML('afterbegin', NAV_HTML);
  const path = window.location.pathname;
  document.querySelectorAll('.nav-links a').forEach(a => {
    try {
      const href = new URL(a.href, location.origin).pathname;
      if (href !== '/' && path.startsWith(href)) a.closest('li')?.classList.add('active');
      if (href === '/' && path === '/') a.closest('li')?.classList.add('active');
    } catch(e) {}
  });
  document.querySelectorAll('.nav-links .has-dropdown').forEach(li => {
    let closeTimer;
    function openDrop() {
      clearTimeout(closeTimer);
      document.querySelectorAll('.nav-links .has-dropdown.open').forEach(other => {
        if (other !== li) other.classList.remove('open');
      });
      li.classList.add('open');
    }
    function closeDrop() {
      closeTimer = setTimeout(() => li.classList.remove('open'), 80);
    }
    li.addEventListener('mouseenter', openDrop);
    li.addEventListener('mouseleave', closeDrop);
    const menu = li.querySelector('.dropdown-menu');
    if (menu) {
      menu.addEventListener('mouseenter', () => clearTimeout(closeTimer));
      menu.addEventListener('mouseleave', closeDrop);
    }
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.has-dropdown'))
      document.querySelectorAll('.has-dropdown.open').forEach(el => el.classList.remove('open'));
  });
  document.querySelectorAll('.nav-links .has-dropdown').forEach(li => {
    const observer = new MutationObserver(() => {
      const chevron = li.querySelector('.chevron');
      if (chevron) chevron.style.transform = li.classList.contains('open') ? 'rotate(180deg)' : '';
    });
    observer.observe(li, { attributes: true, attributeFilter: ['class'] });
  });
  const navInput = document.getElementById('nav-search-input');
  const navSugg  = document.getElementById('nav-suggestions');
  if (navInput && navSugg) {
    let navTimer;

    function renderNavSugg(results) {
      navSugg.innerHTML = results.slice(0, 6).map(r => {
        const statusCls = {ongoing:'status_ongoing',completed:'status_completed',hiatus:'status_hiatus',dropped:'status_dropped'}[r.status] || '';
        return `<div class="nav-sugg-item" data-t="${r.title.replace(/"/g,'&quot;')}">
          ${r.cover
            ? `<img class="sugg-cover" src="${r.cover}" loading="lazy" onerror="this.style.display='none'" alt="" />`
            : `<div class="sugg-cover-placeholder"></div>`}
          <div class="sugg-text">
            <div class="sugg-title">${r.title}</div>
            <div class="sugg-meta">
              ${r.max_chapter ? `<span>Ch.${r.max_chapter}</span>` : ''}
              ${r.status ? `<span class="manga_status ${statusCls}">${r.status}</span>` : ''}
            </div>
          </div>
        </div>`;
      }).join('');
      navSugg.querySelectorAll('.nav-sugg-item').forEach(el => {
        el.addEventListener('mousedown', e => {
          e.preventDefault();
          window.location.href = B + '/search-result.html?q=' + encodeURIComponent(el.dataset.t);
        });
      });
      navSugg.classList.add('visible');
    }

    navInput.addEventListener('input', () => {
      clearTimeout(navTimer);
      const q = navInput.value.trim();
      if (!q || q.length < 2) { navSugg.classList.remove('visible'); return; }
      navTimer = setTimeout(async () => {
        if (typeof API === 'undefined') return;
        const res = await API.search_manga(q);
        if (!res.length) { navSugg.classList.remove('visible'); return; }
        renderNavSugg(res);
      }, 200);
    });
    navInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const q = navInput.value.trim();
        if (q) window.location.href = B + '/search-result.html?q=' + encodeURIComponent(q);
      }
    });
    navInput.addEventListener('blur', () => setTimeout(() => navSugg.classList.remove('visible'), 150));
    document.addEventListener('click', e => {
      if (!e.target.closest('#nav-search-wrap')) navSugg.classList.remove('visible');
    });
  }
  const randomBtn = document.getElementById('random-manga-btn');
  if (randomBtn) {
    randomBtn.addEventListener('click', async e => {
      e.preventDefault();
      if (typeof API === 'undefined') return;
      try {
        const results = await API.search_manga('a'); // light load trigger
        const idx = Math.floor(Math.random() * results.length);
        const manga = results[idx];
        if (manga) {
          window.location.href = B + '/search-result.html?q=' + encodeURIComponent(manga.id);
        }
      } catch(err) { console.error('[Random]', err); }
    });
  }
  const wrap = document.getElementById('user-dropdown-wrap');
  const avatarBtn = document.getElementById('user-avatar-btn');
  if (wrap && avatarBtn) {
    avatarBtn.addEventListener('click', e => {
      e.stopPropagation();
      wrap.classList.toggle('open');
    });
    document.addEventListener('click', () => wrap.classList.remove('open'));
  }

})();
