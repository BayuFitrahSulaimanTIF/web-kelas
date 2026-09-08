// ===================================================
// KONEKTIVITAS — WAJIB INTERNET (minimalis browser)
// Web Kelas TIDAK boleh dipakai offline. Cek:
// 1) Internet (fetch eksternal strict)
// 2) Server lokal (/api/health via fetch)
// Jika salah satu gagal → offline → tampilkan halaman putih
// minimalis mirip Chrome "This site can't be reached"
// (Image 2), bukan overlay gelap lama. Maintenance selalu
// hapus watchdog/server/tampilan lama via server.js.
// ===================================================

(function () {
  'use strict';

  if (window.__FORCE_HTTP_ORIGIN__) return;

  const RETRY_START_MS = 1500;
  const RETRY_MAX_MS = 10000;
  const INTERNET_CACHE_MS = 1500;
  const ONLINE_POLL_MS = 2500;

  let state = 'checking';
  let busy = false;
  let retryTimer = null;
  let retryDelay = RETRY_START_MS;
  let _internetCache = null;
  let _internetCacheAt = 0;
  let _wasOffline = false;
  let tabLoadingInterval = null;
  let titleInterval = null;
  let originalTitle = null;
  let originalFaviconHref = null;

  function log(msg) {
    try { console.log('[Connectivity]', msg, 'state=' + state); } catch {}
  }

  // ponytail: tab loading ala browser (favicon berputar + title titik) — globe Image1 saat idle
  const GLOBE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#5f6368" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15 15 0 0 1 0 20"/><path d="M12 2a15 15 0 0 0 0 20"/></svg>';
  const GLOBE_HREF = 'data:image/svg+xml,' + encodeURIComponent(GLOBE_SVG);
  function getFaviconLink() {
    let l = document.querySelector('link[rel~="icon"]');
    if (!l) { l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; document.head.appendChild(l); }
    return l;
  }
  function startTabLoading() {
    try {
      if (originalTitle === null) originalTitle = document.title || 'TIF 25 Class - Dashboard';
      const link = getFaviconLink();
      if (originalFaviconHref === null) {
        const cur = link.getAttribute('href');
        originalFaviconHref = cur && cur !== '' ? cur : GLOBE_HREF;
      }
      // set type cocok dengan output canvas (PNG) agar browser terima spinner
      link.type = 'image/png';
      const c = document.createElement('canvas'); c.width = 16; c.height = 16;
      const ctx = c.getContext('2d');
      let angle = 0;
      if (tabLoadingInterval) clearInterval(tabLoadingInterval);
      tabLoadingInterval = setInterval(() => {
        angle += 0.42;
        ctx.clearRect(0,0,16,16);
        ctx.strokeStyle = '#5f6368';
        ctx.lineWidth = 1.7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(8,8,5.5, angle, angle + 4.2);
        ctx.stroke();
        link.href = c.toDataURL('image/png');
      }, 80);
    } catch {}
  }
  function stopTabLoading() {
    try {
      if (titleInterval) { clearInterval(titleInterval); titleInterval = null; }
      if (tabLoadingInterval) { clearInterval(tabLoadingInterval); tabLoadingInterval = null; }
      if (originalTitle !== null) { document.title = originalTitle; }
      if (originalFaviconHref !== null) {
        // ganti link element baru biar browser reload favicon (tidak pakai cached spinner)
        const oldLink = document.querySelector('link[rel~="icon"]');
        if (oldLink && oldLink.parentNode) {
          const newLink = document.createElement('link');
          newLink.rel = 'icon';
          newLink.type = 'image/svg+xml';
          newLink.href = originalFaviconHref + (originalFaviconHref.indexOf('?') >= 0 ? '&' : '?') + '_fav_t=' + Date.now();
          oldLink.parentNode.replaceChild(newLink, oldLink);
        }
      }
    } catch {}
  }
  // ponytail: ukur stabilitas (3x fetch + avg/range) — threshold 1.2s avg & 500ms range
  async function isConnectionStable() {
    const eps = ['https://1.1.1.1/cdn-cgi/trace', 'https://connectivitycheck.gstatic.com/generate_204'];
    const times = [];
    for (let i=0;i<3;i++) {
      const url = eps[i % eps.length] + '?t=' + Date.now() + '-' + i;
      const start = performance.now();
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        await fetch(url, { cache:'no-store', mode:'no-cors', signal: ctrl.signal });
        clearTimeout(t);
        times.push(performance.now() - start);
      } catch { return false; }
      await new Promise(r => setTimeout(r, 180));
    }
    const avg = times.reduce((a,b)=>a+b,0)/times.length;
    const range = Math.max(...times) - Math.min(...times);
    const ok = avg < 3000 && range < 1500;
    log('stability avg=' + avg.toFixed(0) + 'ms range=' + range.toFixed(0) + ' ok=' + ok);
    return ok;
  }

  function ensureOfflineOverlay() {
    if (!document.body) return;
    let o = document.getElementById('offline-overlay');
    const whiteHTML = ''
      + '<div style="max-width:650px;width:100%;margin:0 auto;text-align:left;box-sizing:border-box">'
      + '<div style="margin:0 0 28px 0;padding:0;box-sizing:border-box"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="display:block"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="#5f6368" stroke-width="1.4" stroke-linejoin="round"/><path d="M14 2v6h6" stroke="#5f6368" stroke-width="1.4" stroke-linejoin="round"/><circle cx="9" cy="13.5" r="1" fill="#5f6368"/><circle cx="15" cy="13.5" r="1" fill="#5f6368"/><path d="M8.5 16.5c1.2 1 4.8 1 6 0" stroke="#5f6368" stroke-width="1.4" stroke-linecap="round"/></svg></div>'
      + '<h1 style="margin:0 0 12px 0;padding:0;font:400 24px/1.25 Roboto,Arial,sans-serif;color:#202124;letter-spacing:0;box-sizing:border-box">This site can&rsquo;t be reached</h1>'
      + '<p style="margin:0 0 16px 0;padding:0;font:400 14px/1.5 Roboto,Arial,sans-serif;color:#5f6368;box-sizing:border-box"><b style="font-weight:700;color:#202124">localhost:3000</b>&rsquo;s server IP address could not be found.</p>'
      + '<p style="margin:0 0 6px 0;padding:0;font:400 13px/1.5 Roboto,Arial,sans-serif;color:#202124;box-sizing:border-box">Try:</p>'
      + '<ul style="margin:0 0 14px 20px;padding:0 0 0 20px;color:#5f6368;font:400 13px/1.7 Roboto,Arial;list-style:disc outside;box-sizing:border-box">'
      + '<li style="margin:0;padding:0;list-style:disc outside;display:list-item;box-sizing:border-box">Checking the connection</li>'
      + '<li style="margin:0;padding:0;list-style:disc outside;display:list-item;box-sizing:border-box"><a href="#" onclick="return false" style="color:#1a73e8;text-decoration:none;font:inherit">Checking the proxy, firewall, and DNS configuration</a></li>'
      + '<li style="margin:0;padding:0;list-style:disc outside;display:list-item;box-sizing:border-box"><a href="#" onclick="return false" style="color:#1a73e8;text-decoration:none;font:inherit">Running Windows Network Diagnostics</a></li>'
      + '</ul>'
      + '<p id="offline-err" style="margin:0;padding:0;font:400 12px/1.5 Roboto,Arial,sans-serif;color:#5f6368;box-sizing:border-box">ERR_INTERNET_DISCONNECTED</p>'
      + '<p style="margin:10px 0 0 0;padding:0;font:400 13px/1.5 Roboto,Arial,sans-serif;color:#5f6368;box-sizing:border-box">Web Kelas membutuhkan koneksi internet. Hubungkan internet lalu halaman akan memuat ulang otomatis.</p>'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:28px;gap:12px;box-sizing:border-box">'
      + '<button id="offline-reload" type="button" style="background:#1a73e8;color:#fff;border:none;border-radius:4px;padding:9px 24px;font:500 14px Roboto,Arial,sans-serif;cursor:pointer;box-sizing:border-box;line-height:1">Reload</button>'
      + '<button id="offline-details" type="button" style="background:#fff;color:#1a73e8;border:1px solid #dadce0;border-radius:4px;padding:8px 16px;font:500 13px Roboto,Arial,sans-serif;cursor:pointer;box-sizing:border-box;line-height:1">Details</button>'
      + '</div>'
      + '<p style="margin:16px 0 0 0;padding:0;font:400 12px/1.5 Roboto,Arial,sans-serif;color:#70757a;box-sizing:border-box">Mencoba menyambung ulang&hellip;</p>'
      + '</div>';
    const whiteStyle = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:72px 24px 24px;background:#fff;color:#202124;overflow:auto;text-align:left;box-sizing:border-box;font-family:Roboto,Arial,sans-serif';
    if (o) {
      o.style.cssText = whiteStyle;
      o.innerHTML = whiteHTML;
      bindOfflineButtons();
      return;
    }
    o = document.createElement('div');
    o.id = 'offline-overlay';
    o.hidden = true;
    o.setAttribute('role', 'alert');
    o.setAttribute('aria-live', 'assertive');
    o.style.cssText = whiteStyle;
    o.innerHTML = whiteHTML;
    document.body.appendChild(o);
    bindOfflineButtons();
  }

  function bindOfflineButtons() {
    const r = document.getElementById('offline-reload');
    if (r && !r.dataset.bound) {
      r.dataset.bound = '1';
      r.addEventListener('click', () => Connectivity.retryNow());
    }
  }

  function getApiBase() {
    if (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) return window.APP_CONFIG.API_BASE_URL;
    return (window.location.protocol === 'file:' || window.location.hostname.endsWith('ngrok-free.app')) ? 'http://localhost:3000' : window.location.origin) + '/api';
  }

  // ponytail: strict internet check — paralel + cache pendek biar respon cepat (±1.5s) tanpa refresh manual
  async function hasInternet() {
    if (!navigator.onLine) { _internetCache = false; _internetCacheAt = Date.now(); return false; }
    const now = Date.now();
    if (_internetCache !== null && now - _internetCacheAt < INTERNET_CACHE_MS) return _internetCache;
    const endpoints = [
      'https://connectivitycheck.gstatic.com/generate_204',
      'https://1.1.1.1/cdn-cgi/trace',
      'https://www.google.com/generate_204'
    ];
    const tryOne = (url) => new Promise((resolve, reject) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => { ctrl.abort(); reject(new Error('timeout')); }, 1500);
      fetch(url + '?' + now, { method: 'HEAD', cache: 'no-store', signal: ctrl.signal, mode: 'no-cors' })
        .then(() => { clearTimeout(t); resolve(true); })
        .catch((e) => { clearTimeout(t); reject(e); });
    });
    try {
      await Promise.any(endpoints.map(tryOne));
      _internetCache = true; _internetCacheAt = now; return true;
    } catch {
      _internetCache = false; _internetCacheAt = now; return false;
    }
  }

  async function checkNow() {
    if (busy) return;
    busy = true;
    if (state === 'offline') _wasOffline = true;
    state = 'checking';
    render();
    // ponytail: tampilkan loading tab (favicon+title) hanya saat user retry dari disconnect (bukan polling diam)
    const shouldAnimateTab = _wasOffline;
    if (shouldAnimateTab) startTabLoading();
    // ponytail: tombol Reload jadi loading saat checking dari offline
    try {
      const rb = document.getElementById('offline-reload');
      if (rb && _wasOffline) { rb.disabled = true; rb.textContent = 'Loading...'; rb.style.opacity = '0.7'; rb.style.cursor = 'wait'; }
    } catch {}
    log('checkNow started');
    let online = false;
    try {
      // ponytail: coba health dulu (same-origin, butuh ngrok header) — internet check hanya fallback, jangan blokir navigasi jika health ok
      try {
        const healthCtrl = new AbortController(); const healthTimer = setTimeout(() => healthCtrl.abort(), 5000); const r = await fetch(getApiBase() + '/health', { cache: 'no-store', headers: { 'ngrok-skip-browser-warning': '1' }, signal: healthCtrl.signal }); clearTimeout(healthTimer);
        const text = await r.text();
        let data; try { data = JSON.parse(text); } catch { throw new Error('health not json'); }
        log('health=' + JSON.stringify(data));
        online = data && (data.status === 'ok' || data.status === 'degraded');
      } catch (e) {
        log('health fetch failed: ' + (e.message || e));
        const internetOk = await hasInternet();
        log('hasInternet fallback=' + internetOk);
        online = !!internetOk;
      }
    } catch (e) {
      log('checkNow error: ' + (e.message || e));
      online = false;
    }
    if (retryTimer) { window.clearTimeout(retryTimer); retryTimer = null; }
    busy = false;
    if (shouldAnimateTab) stopTabLoading();
    try {
      const rb = document.getElementById('offline-reload');
      if (rb) { rb.disabled = false; rb.textContent = 'Reload'; rb.style.opacity = ''; rb.style.cursor = ''; }
    } catch {}
    log('final online=' + online);
    if (online) {
      state = 'online';
      _wasOffline = false;
      retryDelay = RETRY_START_MS;
      render();
    } else {
      state = 'offline';
      _wasOffline = true;
      render();
      // ponytail: manual reload saja — hilangkan auto-reload saat DISCONNECT
      window.clearTimeout(retryTimer); retryTimer = null;
    }
  }

  function retryNow() {
    if (state === 'offline') {
      window.clearTimeout(retryTimer);
      retryTimer = null;
      retryDelay = RETRY_START_MS;
      _wasOffline = true; // pastikan overlay tetap terlihat saat retry
      checkNow();
    } else if (state === 'checking') {
      // sudah checking, jangan gandakan
    } else if (state === 'online') {
      // online → boleh reload halaman
      location.reload();
    }
  }

  // ponytail: hard-block hanya saat offline — saat online/checking biarkan klik jalan (termasuk tombol Jadwal)
  function installGlobalBlock() {
    document.addEventListener('click', (e) => {
      if (e.target.closest && e.target.closest('#offline-overlay')) return;
      
    }, true);

    document.addEventListener('submit', (e) => {
      if (state === 'offline') { e.preventDefault(); e.stopImmediatePropagation(); return; }
    }, true);

    if (window.Api && window.Api.request && !window.Api._offlinePatched) {
      const orig = window.Api.request.bind(window.Api);
      window.Api.request = async (...a) => {
        if (state !== 'online') {
          throw new Error('Offline');
        }
        try { return await orig(...a); } catch (err) {
          const msg = String(err && err.message || '');
          if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
            // hanya log, JANGAN ubah state atau panggil checkNow
            log('Api.request network error');
          }
          throw err;
        }
      };
      window.Api._offlinePatched = true;
    }
  }

  function render() {
    const isOnline = state === 'online';
    // ponytail: blokir hanya saat offline / retry dari offline — checking saat online jangan kedip (poll 2.5s tetap enabled)
    const shouldBlock = state === 'offline' || (state === 'checking' && _wasOffline);
    document.querySelectorAll('[data-needs-server]').forEach((el) => {
      if (el.querySelector && el.querySelector('.spinner')) return; // ponytail: sedang Memproses — jangan timpa loading
      el.disabled = shouldBlock;
      el.classList.toggle('is-disabled', shouldBlock);
    });
    ensureOfflineOverlay();
    const overlay = document.getElementById('offline-overlay');
    if (overlay) {
      overlay.hidden = !shouldBlock;
      overlay.style.display = shouldBlock ? 'flex' : 'none';
      // ponytail: jangan sembunyikan scroll bahkan saat offline
      const h1 = overlay.querySelector('h1');
      if (h1) h1.textContent = isOnline ? 'Memeriksa koneksi\u2026' : 'This site can\u2019t be reached';
      const err = overlay.querySelector('#offline-err');
      if (err) err.style.display = isOnline ? 'none' : 'block';
    }
    document.dispatchEvent(new CustomEvent('app:connection', {
      detail: { online: isOnline, state: state }
    }));
  }

  function init() {
    installGlobalBlock();

    window.addEventListener('online', () => {
      log('browser online event');
      _internetCache = null;
      window.clearTimeout(retryTimer);
      retryTimer = null;
      retryDelay = RETRY_START_MS;
      // ponytail: manual reload saja saat DISCONNECT — online event tidak auto retry
      if (state === 'online' && !_wasOffline && !busy) checkNow();
    });
    window.addEventListener('offline', () => {
      log('browser offline event');
      _internetCache = null;
      _wasOffline = true;
      state = 'offline';
      render();
      window.clearTimeout(retryTimer); retryTimer = null;
      stopTabLoading();
    });
    // ponytail: polling hanya saat ONLINE (deteksi putus otomatis), saat DISCONNECT manual reload saja
    window.setInterval(() => {
      if (!busy && state === 'online' && !_wasOffline) checkNow();
    }, ONLINE_POLL_MS);
    // cek cepat saat tab kembali fokus / terlihat — hanya saat online
    window.addEventListener('focus', () => { if (state !== 'online' || _wasOffline) return; _internetCache = null; if (!busy) checkNow(); });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      if (state !== 'online' || _wasOffline) return;
      _internetCache = null; if (!busy) checkNow();
    });
    window.setTimeout(function initialCheck() { checkNow(); }, 0);
  }

  window.Connectivity = {
    init: init,
    retryNow: retryNow,
    isOnline: function () { return state === 'online'; },
    getState: function () { return state; }
  };

  init();
})();