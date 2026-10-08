// ===================================================
// LOGIN LEWAT FACEBOOK
// Alurnya OAuth redirect, jadi tidak ada tombol yang dirender pustaka:
// cukup tautan ke /api/auth/facebook/start. Backend yang menukar code,
// membaca profil dari Graph API, dan menerbitkan sesi.
// Tautan disembunyikan kalau FACEBOOK_APP_ID/SECRET belum diisi.
// ===================================================

(function () {
  'use strict';

  const state = { link: null, row: null };

  function selectDom() {
    state.link = document.getElementById('facebook-login');
    state.row = document.getElementById('oauth-row');
  }

  function apiBase() {
    return (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
      || (window.location.origin + '/api');
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function initialize() {
    selectDom();
    if (!state.link) return;

    let config = null;

    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await fetch(apiBase() + '/auth/facebook/config', {
          headers: { 'ngrok-skip-browser-warning': '1' },
          cache: 'no-store'
        });
        if (response.ok) config = await response.json();
        break;
      } catch (error) {
        if (attempt === 3) return;
        await wait(800);
      }
    }

    if (!config || !config.enabled) {
      state.link.hidden = true;
      return;
    }

    state.link.href = config.startUrl;
    state.link.hidden = false;
    if (state.row) state.row.hidden = false;
  }

  initialize();
})();