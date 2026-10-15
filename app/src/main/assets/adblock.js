(function () {
  if (window.__ytw) return; window.__ytw = true;

  // 0. Conexiuni anticipate către serverele folosite la încărcare
  ['https://i.ytimg.com', 'https://www.gstatic.com', 'https://fonts.gstatic.com'].forEach(u => {
    try {
      const l = document.createElement('link');
      l.rel = 'preconnect'; l.href = u; l.crossOrigin = '';
      (document.head || document.documentElement).appendChild(l);
    } catch (e) {}
  });

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
  Response.prototype.json = function () {
    const p = _rj.call(this);
    return (this.url && this.url.indexOf('/youtubei/v1/') !== -1) ? p.then(strip) : p;
  };

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

  // 5. PiP: în fereastra mică, video-ul umple tot ecranul și fără controale
  const PIP_CSS =
    'html,body{overflow:hidden!important;background:#000!important}' +
    'video{position:fixed!important;top:0!important;left:0!important;width:100vw!important;' +
      'height:100vh!important;z-index:2147483647!important;object-fit:contain!important;' +
      'background:#000!important}' +
    '.ytp-chrome-top,.ytp-chrome-bottom,.ytp-gradient-top,.ytp-gradient-bottom,' +
      '.ytp-pause-overlay,.ytp-ce-element,.ytp-cards-teaser,.ytp-paid-content-overlay' +
      '{display:none!important}';

  let pipStyle = null;
  window.__ytwPip = on => {
    if (on && !pipStyle) {
      pipStyle = document.createElement('style');
      pipStyle.textContent = PIP_CSS;
      (document.head || document.documentElement).appendChild(pipStyle);
    } else if (!on && pipStyle) {
      pipStyle.remove();
      pipStyle = null;
    }
  };

  // 6. Gest: atingi playerul și tragi în jos => PiP
  let sx = 0, sy = 0, tracking = false, fired = false;
  const inPlayer = t => t && t.closest &&
    t.closest('#player-container-id,#player,.html5-video-player,.player-container,ytm-player');
  const isSeek = t => t && t.closest &&
    t.closest('.ytp-progress-bar-container,.ytp-chapter-hover-container,.ytp-scrubber-container');

  document.addEventListener('touchstart', e => {
    tracking = false; fired = false;
    if (location.pathname !== '/watch' || e.touches.length !== 1) return;
    if (!inPlayer(e.target) || isSeek(e.target)) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    tracking = true;
  }, { capture: true, passive: true });

  document.addEventListener('touchmove', e => {
    if (!tracking) return;
    const dx = e.touches[0].clientX - sx;
    const dy = e.touches[0].clientY - sy;
    const vertical = dy > 25 && Math.abs(dx) < dy * 0.6;
    if (!vertical) return;
    e.stopPropagation();
    e.preventDefault();
    if (!fired && dy > 110) {
      fired = true;
      if (document.querySelector('video') && window.AndroidPip) window.AndroidPip.enter();
    }
  }, { capture: true, passive: false });

  // 7. Sărire rapidă peste reclame (doar pe pagina video)
  setInterval(() => {
    if (location.pathname !== '/watch') return;
    const p = document.querySelector('.html5-video-player');
    if (!p) return;
    if (p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting')) {
      const v = document.querySelector('video');
      if (v) {
        v.muted = true;
        if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
        v.playbackRate = 16;
      }
      document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')
        .forEach(b => b.click());
    }
  }, 150);
})();
