// ===================================================
// LOGIN LEWAT GOOGLE
// Pustaka Google Identity Services menampilkan tombolnya sendiri.
// Callback-nya kirim ID token ke backend; backend yang verifikasi
// dan menerbitkan sesi. Client ID diambil dari /auth/google/config
// supaya tidak ditulis ulang di sini.
// ===================================================

(function () {
  'use strict';

  const state = {
    isReady: false,
    isSubmitting: false,
    elements: {}
  };

  const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

  function selectDom() {
    state.elements = {
      wrap: document.getElementById('google-login'),
      mount: document.getElementById('google-signin-button'),
      message: document.getElementById('google-message')
    };
  }

  function loadGoogleScript() {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="' + SCRIPT_SRC + '"]');

      if (existing) {
        if (window.google && window.google.accounts) {
          resolve(window.google);
          return;
        }
        existing.addEventListener('load', () => resolve(window.google));
        existing.addEventListener('error', reject);
        return;
      }

      const script = document.createElement('script');
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => (window.google ? resolve(window.google) : reject(new Error('Pustaka Google tidak termuat')));
      script.onerror = () => reject(new Error('Pustaka Google gagal dimuat'));
      document.head.appendChild(script);
    });
  }

  async function initialize() {
    selectDom();

    if (!state.elements.wrap) return;

    // Server yang menentukan apakah fitur ini hidup. Kalau
    // GOOGLE_CLIENT_ID belum diisi, tombolnya tidak muncul sama sekali.
    let config;
    try {
      config = await window.Api.request('/auth/google/config');
    } catch (error) {
      return;
    }

    if (!config || !config.enabled || !config.clientId) return;

    try {
      const google = await loadGoogleScript();

      google.accounts.id.initialize({
        client_id: config.clientId,
        callback: handleCredential
      });

      google.accounts.id.renderButton(state.elements.mount, {
        theme: 'outline',
        size: 'large',
        width: Math.min(360, state.elements.wrap.clientWidth || 360),
        text: 'continue_with',
        locale: 'id'
      });

      state.elements.wrap.hidden = false;
      state.isReady = true;
    } catch (error) {
      // Tombol tidak muncul = fitur、Google, atau jaringan sedang bermasalah.
      // Jangan ganggu alur login email yang sudah berjalan normal.
      state.elements.wrap.hidden = true;
    }
  }

  async function handleCredential(response) {
    if (state.isSubmitting) return;

    const idToken = response && response.credential;
    if (!idToken) return;

    state.isSubmitting = true;
    UI.setMessage(state.elements.message, '');

    try {
      const data = await window.Api.request('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ token: idToken })
      });

      saveAuthSession(data);

      const note = data.isNewAccount
        ? 'Akun dibuat dari Google, masuk...'
        : 'Login berhasil, mengalihkan...';

      UI.setMessage(state.elements.message, note, 'success');
      UI.showToast(note, 'success');

      window.setTimeout(() => {
        window.location.href = APP_CONFIG.ROUTES.dashboard;
      }, 650);
    } catch (error) {
      const message = error.network || error.abort
        ? error.message
        : error.message || 'Login dengan Google gagal';

      UI.setMessage(state.elements.message, message);
      UI.showToast(message, 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // Sama seperti login biasa: token + user ditulis ke sessionStorage.
  function saveAuthSession(data) {
    const storage = sessionStorage;

    if (data.token) {
      storage.setItem(APP_CONFIG.STORAGE_KEYS.token, data.token);
    }

    if (data.refreshToken) {
      storage.setItem(APP_CONFIG.STORAGE_KEYS.refreshToken, data.refreshToken);
    }

    if (data.user) {
      storage.setItem(APP_CONFIG.STORAGE_KEYS.user, JSON.stringify(data.user));
    }
  }

  document.addEventListener('DOMContentLoaded', initialize);
})();