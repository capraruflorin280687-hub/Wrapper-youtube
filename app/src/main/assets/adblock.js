(function () {
  if (window.__ytw) return; window.__ytw = true;

  // MOD: 'skip'  = nu atinge datele YouTube, doar sare rapid peste reclame (nu merge bine)
  //      'strip' = șterge reclamele din date (metoda care redă video-urile)
  const MODE = 'strip';

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

  if (MODE === 'strip') {
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
  }

  // 3. Reguli cosmetice permanente: reclame și bannere "deschide aplicația"
  const ALWAYS = [
    'ytm-promoted-sparkles-web-renderer', 'ytm-promoted-video-renderer',
    'ytm-companion-ad-renderer', 'ytm-ad-slot-renderer', 'ytm-statement-banner-renderer',
    'ytd-ad-slot-renderer', 'ytd-promoted-sparkles-web-renderer', '.ytp-ad-overlay-container',
    '.ytp-ad-module', '#masthead-ad', 'ytm-rich-item-renderer:has(ytm-ad-slot-renderer)',
    'ytd-in-feed-ad-layout-renderer', 'ytm-open-app-banner', 'ytm-app-promo-renderer',
    'ytm-mealbar-promo-renderer', 'ytm-upsell-dialog-renderer',
    // adăugate după Litube (ads.js)
    'ad-slot-renderer', 'ytd-display-ad-renderer', 'ytm-promoted-sparkles-web-renderer',
    'ytm-app-install-ad-renderer', 'ytm-open-in-app-renderer', 'yt-mealbar-promo-renderer',
    '.video-ads.ytp-ad-module', '#player-ads', '#related #player-ads',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
    'tp-yt-paper-dialog:has(yt-mealbar-promo-renderer)',
    'ytd-rich-item-renderer:has(ytd-display-ad-renderer)',
    'ytm-mobile-topbar-renderer a[href^="intent:"][href*="package=com.google.android.youtube;"]',
    'ytm-mobile-topbar-renderer a[href^="vnd.youtube:"]',
    'ytm-mobile-topbar-renderer a[href^="youtube:"]'
  ];

  // 3b. Reclame în Shorts: filtrăm răspunsul reel_watch_sequence (după Litube)
  const isObj = v => v !== null && typeof v === 'object';
  const hasAd = n => {
    if (!isObj(n)) return false;
    if (Array.isArray(n)) return n.some(hasAd);
    return !!(n.adClientParams || n.adPlacements || n.adSlots || n.adBreakHeartbeatParams || n.adSlotRenderer);
  };
  const isAdEntry = e => {
    if (!isObj(e)) return false;
    if (hasAd(e)) return true;
    const ep = e.command || e.navigationEndpoint || e.reelWatchEndpoint;
    return hasAd(ep) || hasAd(e.reelWatchEndpoint) ||
      hasAd(e.command && e.command.reelWatchEndpoint) || hasAd(e.ad);
  };
  if (MODE === 'strip') {
  const _fetch = window.fetch;
  window.fetch = function (input) {
    const p = _fetch.apply(this, arguments);
    const u = typeof input === 'string' ? input : (input && input.url) || '';
    if (u.indexOf('/youtubei/v1/reel/reel_watch_sequence') === -1) return p;
    return p.then(async res => {
      if (res.status === 204 || res.status === 205 || res.status === 304) return res;
      try {
        const text = await res.clone().text();
        const json = JSON.parse(text);
        if (Array.isArray(json.entries)) json.entries = json.entries.filter(e => !isAdEntry(e));
        if (isObj(json.playerResponse)) strip(json.playerResponse);
        const body = JSON.stringify(json);
        if (body === text) return res;
        const h = new Headers(res.headers);
        h.delete('content-length');
        return new Response(body, { status: res.status, statusText: res.statusText, headers: h });
      } catch (e) { return res; }
    });
  };
  }

  // 3c. Ascunde butoanele "Deschide aplicația" din bară și din dialoguri (după Litube)
  const APP_LABELS = [
    'open app', 'open in app', 'open in the app', 'use app', 'use the app',
    'deschide aplicația', 'deschide aplicatia', 'deschide în aplicație', 'deschide in aplicatie'
  ];
  const norm = s => String(s || '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
  const hideAppButtons = () => {
    const surfaces = document.querySelectorAll(
      'ytm-mobile-topbar-renderer,ytm-mobile-app-bar,#masthead,[role="dialog"],ytm-dialog,tp-yt-paper-dialog,bottom-sheet-layout');
    for (let i = 0; i < surfaces.length; i++) {
      const ctrls = surfaces[i].querySelectorAll('a,button,[role="button"]');
      for (let j = 0; j < ctrls.length; j++) {
        const c = ctrls[j];
        const labels = [norm(c.getAttribute('aria-label')), norm(c.textContent)];
        if (labels.some(l => APP_LABELS.indexOf(l) !== -1)) c.style.setProperty('display', 'none', 'important');
      }
    }
  };
  setInterval(hideAppButtons, 1000);

  // Mini-player în aplicație: playerul își păstrează mărimea reală, doar se scalează
  const MINI_CSS =
    'html.ytw-mini .ytw-miniel{' +
      'position:fixed!important;right:8px!important;bottom:72px!important;left:auto!important;' +
      'top:auto!important;width:var(--ytw-w)!important;height:var(--ytw-h)!important;' +
      'margin:0!important;transform-origin:100% 100%!important;' +
      'transform:scale(var(--ytw-s))!important;z-index:2147483000!important;' +
      'border-radius:14px!important;overflow:hidden!important;background:#000!important;' +
      'box-shadow:0 4px 18px rgba(0,0,0,.7)!important;will-change:transform}' +
    'html.ytw-mini .ytp-chrome-top,html.ytw-mini .ytp-chrome-bottom,' +
    'html.ytw-mini .ytp-gradient-top,html.ytw-mini .ytp-gradient-bottom,' +
    'html.ytw-mini .ytp-pause-overlay,html.ytw-mini .ytp-ce-element,' +
    'html.ytw-mini .ytp-cards-teaser,html.ytw-mini .ytp-paid-content-overlay{display:none!important}';

  const base = document.createElement('style');
  base.textContent = ALWAYS.join(',') + '{display:none!important}' + MINI_CSS +
    (MODE === 'skip' ? '.ad-showing video,.ad-interrupting video{opacity:0!important}' : '');
  (document.head || document.documentElement).appendChild(base);

  // 4. Reguli DOAR pentru pagina video: se adaugă pe /watch, se scot în rest
  const WATCH_CSS =
    'ytm-mobile-topbar-renderer,header.mobile-topbar-header,.mobile-topbar-header' +
      '{display:none!important;height:0!important;min-height:0!important}' +
    ':root{--ytm-topbar-height:0px!important;--ytm-mobile-topbar-height:0px!important}' +
    'ytm-app,ytm-watch,ytm-single-column-watch-next-results-renderer' +
      '{padding-top:0!important;margin-top:0!important}' +
    'html:not(.ytw-mini) #player-container-id,html:not(.ytw-mini) .player-container,' +
    'html:not(.ytw-mini) #player,html:not(.ytw-mini) .sticky-player' +
      '{top:0!important;margin-top:0!important}';

  let watchStyle = null;
  let lastVideo = '';
  const root = document.documentElement;
  let miniEl = null;
  const enterMini = () => {
    const el = document.querySelector('#player-container-id') || document.querySelector('.player-container');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 50 || r.height < 50) return false;
    const s = Math.min(0.55, (window.innerWidth * 0.5) / r.width);
    el.style.setProperty('--ytw-w', r.width + 'px');
    el.style.setProperty('--ytw-h', r.height + 'px');
    el.style.setProperty('--ytw-s', s.toFixed(3));
    el.classList.add('ytw-miniel');
    root.classList.add('ytw-mini');
    miniEl = el;
    return true;
  };
  const exitMini = () => {
    root.classList.remove('ytw-mini');
    if (miniEl) {
      miniEl.classList.remove('ytw-miniel');
      ['--ytw-w', '--ytw-h', '--ytw-s'].forEach(p => miniEl.style.removeProperty(p));
      miniEl = null;
    }
    [60, 350].forEach(t => setTimeout(() => window.dispatchEvent(new Event('resize')), t));
  };
  const setMini = on => {
    if (on) return enterMini();
    if (root.classList.contains('ytw-mini')) exitMini();
  };

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
    // Alt video sau altă pagină => ieșim din modul mini
    const vid = isWatch ? location.search : '';
    if (vid !== lastVideo) { lastVideo = vid; setMini(false); }
    if (!isWatch) setMini(false);
  };
  updatePage();
  setInterval(updatePage, 300);

  // 5. Gest: atingi playerul și tragi în jos => mini-player în aplicație
  let sx = 0, sy = 0, tracking = false, fired = false;
  const inPlayer = t => t && t.closest &&
    t.closest('#player-container-id,#player,.html5-video-player,.player-container,ytm-player');
  const isSeek = t => t && t.closest &&
    t.closest('.ytp-progress-bar-container,.ytp-chapter-hover-container,.ytp-scrubber-container');

  document.addEventListener('touchstart', e => {
    tracking = false; fired = false;
    if (location.pathname !== '/watch' || e.touches.length !== 1) return;
    if (root.classList.contains('ytw-mini')) return;
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
    if (!fired && dy > 90) {
      fired = true;
      setMini(true);
    }
  }, { capture: true, passive: false });

  // Apăsare pe mini-player => revine pe ecran mare
  document.addEventListener('click', e => {
    if (!root.classList.contains('ytw-mini')) return;
    if (inPlayer(e.target)) {
      e.stopPropagation();
      e.preventDefault();
      setMini(false);
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (x) {}
    }
  }, true);

  // 6. Sărire rapidă peste reclame (doar pe pagina video); restaurează sunetul și viteza după
  let adWas = null;
  setInterval(() => {
    if (location.pathname !== '/watch') return;
    const p = document.querySelector('.html5-video-player');
    if (!p) return;
    const v = document.querySelector('video');
    const isAd = p.classList.contains('ad-showing') || p.classList.contains('ad-interrupting');
    if (isAd) {
      if (v) {
        if (!adWas) adWas = { muted: v.muted, rate: v.playbackRate };
        v.muted = true;
        if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
        v.playbackRate = 16;
      }
      document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-skip-ad-button')
        .forEach(b => b.click());
    } else if (adWas) {
      if (v) { v.muted = adWas.muted; v.playbackRate = adWas.rate || 1; }
      adWas = null;
    }
  }, 150);
})();
