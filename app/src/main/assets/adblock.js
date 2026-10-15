(function () {
  if (window.__ytw) return; window.__ytw = true;

  // 1. Redare în fundal
  try {
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: () => false, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: () => 'visible', configurable: true });
    document.hasFocus = () => true;
  } catch (e) {}
  ['visibilitychange', 'webkitvisibilitychange', 'pagehide', 'blur', 'freeze'].forEach(ev => {
    window.addEventListener(ev, e => e.stopImmediatePropagation(), true);
    document.addEventListener(ev, e => e.stopImmediatePropagation(), true);
  });

  // 2. Eliminare reclame din date
  const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const strip = o => {
    if (o && typeof o === 'object') {
      for (let i = 0; i < AD_KEYS.length; i++) { if (AD_KEYS[i] in o) delete o[AD_KEYS[i]]; }
      if (o.playerResponse) strip(o.playerResponse);
    }
    return o;
  };

  const _parse = JSON.parse;
  JSON.parse = function () {
    const r = _parse.apply(this, arguments);
    if (r && typeof r === 'object' && (r.adPlacements || r.playerAds || r.adSlots || r.playerResponse)) strip(r);
    return r;
  };

  const _rj = Response.prototype.json;
  Response.prototype.json = function () { return _rj.call(this).then(strip); };

  let _ipr;
  try {
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      get: () => _ipr, set: v => { _ipr = strip(v); }, configurable: true
    });
  } catch (e) {}

  // 3. Reguli cosmetice permanente: reclame și bannere "deschide aplicația"
  const ALWAYS = [
    'ytm-promoted-sparkles-web-renderer', 'ytm-promoted-video-renderer',
    'ytm-companion-ad-renderer', 'ytm-ad-slot-renderer', 'ytm-statement-banner-renderer',
    'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-web-renderer', '.ytp-ad-overlay-container',
    '.ytp-ad-module', '#masthead-ad', 'ytm-rich-item-renderer:has(ytm-ad-slot-renderer)',
    'ytd-in-feed-ad-layout-renderer', 'ytm-open-app-banner', 'ytm-app-promo-renderer',
    'ytm-mealbar-promo-renderer', 'ytm-upsell-dialog-renderer'
  ];
  const base = document.createElement('style');
  base.textContent = ALWAYS.join(',') + '{display:none!important}';
  (document.head || document.documentElement).appendChild(base);

  // 4. Reguli DOAR pentru pagina video: se adaugă pe /watch, se scot în rest
  const WATCH_CSS =
    'ytm-mobile-topbar-renderer,header.mobile-topbar-header,.mobile-topbar-header' +
      '{display:none!important;height:0!important;min-height:0!important}' +
    ':root{--ytm-topbar-height:0px!important;--ytm-mobile-topbar-height:0px!important}' +
    'ytm-app,ytm-watch,ytm-single-column-watch-next-results-renderer' +
      '{padding-top:0!important;margin-top:0!important}' +
    '#player-container-id,.player-container,#player,.sticky-player' +
      '{top:0!important;margin-top:0!important}';

  let watchStyle = null;
  const updatePage = () => {
    const isWatch = location.pathname === '/watch';
    if (isWatch && !watchStyle) {
      watchStyle = document.createElement('style');
      watchStyle.textContent = WATCH_CSS;
      (document.head || document.documentElement).appendChild(watchStyle);
    } else if (!isWatch && watchStyle) {
      watchStyle.remove();
      watchStyle = null;
    }
  };
  updatePage();
  setInterval(updatePage, 300);

  // 5. Skip automat dacă apare totuși o reclamă
  setInterval(() => {
    const p = document.querySelector('.html5-video-player');
    const v = document.querySelector('video');
    if (p && v && p.classList.contains('ad-showing')) {
      v.muted = true;
      if (isFinite(v.duration)) v.currentTime = v.duration;
      v.playbackRate = 16;
    }
    document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')
      .forEach(b => b.click());
  }, 400);
})();
