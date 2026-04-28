(function () {
  const xhr = new XMLHttpRequest();
  const scriptSrc = document.currentScript
    ? document.currentScript.src
    : (document.querySelector('script[src*="config.js"]') || {}).src || '';

  const configUrl = scriptSrc
    ? scriptSrc.replace(/js\/config\.js.*$/, 'config.json')
    : 'config.json';

  xhr.open('GET', configUrl, false);
  xhr.send(null);

  let cfg = { base: '/mangalink' };
  if (xhr.status === 200) {
    try { cfg = JSON.parse(xhr.responseText); } catch (e) {}
  }

  window.BASE = typeof cfg.base === 'string' ? cfg.base.replace(/\/$/, '') : '';
})();
