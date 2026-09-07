// ===================================================
// INITIALIZATION
// ===================================================

// Origin API otomatis: jika halaman disajikan oleh server
// (http://...), pakai alamat relatif sehingga tidak pernah
// salah port/domain.
//
// PENTING: halaman login TIDAK boleh dipakai dari file://.
// sessionStorage terpisah per-origin; token yang disimpan di
// file://frontend/index.html tidak bisa dibaca dashboard di
// http://localhost:3000/dashboard/. Itulah penyebab login pertama
// berhasil tetapi dashboard kembali ke halaman login ("login 2x").
// Saat file:// terdeteksi, halaman dikunci lalu diarahkan otomatis
// ke origin server yang benar.
const __serverOrigin = 'http://localhost:3000';
const __isFileOrigin = window.location.protocol === 'file:';
const __apiOrigin = __isFileOrigin ? __serverOrigin : '';

window.APP_CONFIG = {
  SITE_NAME: 'Sistem Mata Kuliah Perguruan Tinggi',
  SITE_SHORT_NAME: 'SKPT',
  VERSION: '1.0.0',
  LOGO_PATH: 'assets/images/logo/logo-putih.png',
  CAMPUS_IMAGE_PATH: 'assets/images/campus/campus.png',
  API_BASE_URL: __apiOrigin + '/api',
  APP_ORIGIN: window.location.origin,
  TIMEOUT_MS: 10000,
  ROUTES: {
    dashboard: (__apiOrigin || window.location.origin) + '/dashboard.html',
    forgotPassword: '#',
    sso: '#'
  },
  STORAGE_KEYS: {
    token: 'auth_token',
    refreshToken: 'auth_refresh_token',
    user: 'auth_user',
    resetIdentifier: 'reset_identifier'
  }
};

(function enforceServedOrigin() {
  if (!__isFileOrigin) return;

  window.__FORCE_HTTP_ORIGIN__ = true;

  const targetUrl = __serverOrigin + '/';
  let retryDelay = 600;

  function blockLocalFileInteraction(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function lockLocalFilePage() {
    document.addEventListener('click', blockLocalFileInteraction, true);
    document.addEventListener('submit', blockLocalFileInteraction, true);

    document.querySelectorAll('input, button, select, textarea').forEach((el) => {
      el.disabled = true;
    });

    document.querySelectorAll('a').forEach((el) => {
      el.setAttribute('aria-disabled', 'true');
      el.addEventListener('click', (event) => event.preventDefault());
    });

    const message = document.getElementById('login-message');
    if (message) {
      message.classList.add('success');
      message.textContent = 'Membuka alamat server agar sesi login sama dengan dashboard...';
    }

    const overlay = document.getElementById('loading-overlay');
    const overlayText = overlay ? overlay.querySelector('p') : null;
    if (overlayText) overlayText.textContent = 'Menghubungkan ke server...';
    if (overlay) overlay.hidden = false;
  }

  async function redirectWhenServerReady() {
    try {
      const response = await fetch(__serverOrigin + '/api/health', { cache: 'no-store' });
      if (response.ok) {
        window.location.replace(targetUrl);
        return;
      }
    } catch (error) {
      // Server belum siap; watchdog akan menyalakan ulang lalu dicek lagi.
    }

    window.setTimeout(redirectWhenServerReady, retryDelay);
    retryDelay = Math.min(Math.round(retryDelay * 1.6), 3000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lockLocalFilePage);
  } else {
    lockLocalFilePage();
  }

  redirectWhenServerReady();
})();
