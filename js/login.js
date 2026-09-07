(function () {
  'use strict';

  if (window.__FORCE_HTTP_ORIGIN__) return;

  const state = {
    isSubmitting: false,
    manualLogin: false,
    restoreDone: false,
    elements: {}
  };

  // ===================================================
  // INITIALIZATION
  // ===================================================

  document.addEventListener('DOMContentLoaded', initializeLoginPage);

  function initializeLoginPage() {
    selectDom();

    if (!state.elements.form) return;

    // Kolom email/password SELALU kosong saat halaman login dibuka,
    // termasuk setelah logout dari dashboard atau refresh. Browser
    // (autofill) dan bfcache dapat mengisi ulang kolom, jadi bersihkan
    // juga saat peristiwa pageshow (restore dari cache navigasi).
    clearCredentialsFields();

    bindEvents();
    autoRestoreSession();

    // pageshow: hanya restore bfcache (persisted=true, mis. tombol
    // Back) yang memvalidasi sesi lagi. Muatan halaman pertama TIDAK
    // boleh menjalankan pemulihan 2x — itulah salah satu pemicu
    // "login muncul 2x".
    window.addEventListener('pageshow', (event) => {
      clearCredentialsFields();
      if (event.persisted) {
        state.restoreDone = false;
        state.manualLogin = false;
        autoRestoreSession();
      }
    });
  }

  // Sesi aktif di tab ini dikembalikan otomatis: token divalidasi ke
  // server, lalu langsung diarahkan ke dashboard tanpa klik manual.
  // Dijalankan TEPAT SATU KALI per muatan halaman. Hasil basi (respons
  // yang sampai SETELAH pengguna login manual) diabaikan — kalau tidak,
  // sesi baru bisa terhapus oleh 401 dari token lama (penyebab
  // "login muncul 2x").
  let restoreToken = null;

  function autoRestoreSession() {
    if (state.restoreDone) return;
    state.restoreDone = true;

    const token = sessionStorage.getItem(APP_CONFIG.STORAGE_KEYS.token);
    if (!token) return;

    restoreToken = token;

    // Anti-loop: jika halaman login baru saja di-bounce balik dari
    // dashboard (bendera dipasang sebelum redirect), jangan redirect
    // otomatis lagi — buang sesi dan biarkan pengguna masuk manual.
    if (sessionStorage.getItem('restore_bounced') === '1') {
      clearStoredSession();
      UI.showToast('Sesi berakhir. Silakan masuk kembali', 'info');
      return;
    }

    window.Api.request('/auth/me', { method: 'GET' })
      .then((data) => {
        if (state.manualLogin || !data.user) return;
        sessionStorage.setItem(APP_CONFIG.STORAGE_KEYS.user, JSON.stringify(data.user));
        sessionStorage.setItem('restore_bounced', '1');
        window.location.replace(APP_CONFIG.ROUTES.dashboard);
      })
      .catch((error) => {
        if (error.status !== 401 && error.status !== 403) return;
        // Hanya hapus sesi bila token yang divalidasi MASIH menjadi
        // token aktif. Jika pengguna sudah login ulang (token baru
        // tersimpan), hasil basi ini TIDAK boleh menghapus sesi baru.
        if (!state.manualLogin && sessionStorage.getItem(APP_CONFIG.STORAGE_KEYS.token) === restoreToken) {
          clearStoredSession();
        }
      });
  }

  function clearStoredSession() {
    sessionStorage.removeItem(APP_CONFIG.STORAGE_KEYS.token);
    sessionStorage.removeItem(APP_CONFIG.STORAGE_KEYS.user);
    sessionStorage.removeItem('restore_bounced');
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.token);
    localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.user);
  }

  function clearCredentialsFields() {
    if (state.elements.username) state.elements.username.value = '';
    if (state.elements.password) state.elements.password.value = '';
  }

  // ===================================================
  // DOM SELECTOR
  // ===================================================

  function selectDom() {
    state.elements = {
      form: document.getElementById('login-form'),
      card: document.querySelector('.login-card'),
      username: document.getElementById('username'),
      password: document.getElementById('password'),
      submit: document.getElementById('login-submit'),
      passwordToggle: document.getElementById('password-toggle'),
      message: document.getElementById('login-message'),
      forgotLink: document.querySelector('.forgot-link'),
      ssoButton: document.getElementById('sso-login'),
      modalClose: document.getElementById('modal-close')
    };
  }

  // ===================================================
  // LOGIN FUNCTION
  // ===================================================

  async function submitLogin(event) {
    event.preventDefault();

    if (state.isSubmitting) return;

    const formData = getFormData();
    const errors = validateLoginForm(formData);

    UI.clearAllFieldErrors(state.elements.form);
    UI.setMessage(state.elements.message, '');

    if (Object.keys(errors).length > 0) {
      renderValidationErrors(errors);
      Animation.shake(state.elements.card);
      return;
    }

    // Tandai login manual: fetch pemulihan sesi yang masih berjalan
    // TIDAK boleh lagi menghapus/mengalihkan sesi (anti "login 2x").
    state.manualLogin = true;

    state.isSubmitting = true;
    UI.setButtonLoading(state.elements.submit, true);

    try {
      const data = await requestLogin(formData);
      saveAuthSession(data);

      UI.setMessage(state.elements.message, 'Login berhasil, mengalihkan...', 'success');
      UI.showToast('Login berhasil', 'success');

      window.setTimeout(() => {
        window.location.href = APP_CONFIG.ROUTES.dashboard;
      }, 650);
    } catch (error) {
      if (error.network) {
        window.Connectivity.retryNow();
      }

      const message = error.network || error.abort
        ? error.message
        : error.message || 'Terjadi kesalahan saat login';

      UI.setMessage(state.elements.message, message);
      UI.showToast(message, 'error');
      Animation.shake(state.elements.card);
    } finally {
      state.isSubmitting = false;
      UI.setButtonLoading(state.elements.submit, false);
    }
  }

  async function requestLogin(formData) {
    return window.Api.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: formData.username,
        password: formData.password
      })
    });
  }

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

  // ===================================================
  // VALIDATION
  // ===================================================

  function getFormData() {
    return {
      username: state.elements.username.value.trim(),
      password: state.elements.password.value
    };
  }

  function validateLoginForm(formData) {
    return Validator.validateLogin(formData);
  }

  function renderValidationErrors(errors) {
    Object.entries(errors).forEach(([name, message]) => {
      const input = state.elements[name];
      UI.showFieldError(input, message);
    });

    const firstError = Object.keys(errors)[0];
    if (state.elements[firstError]) {
      state.elements[firstError].focus();
    }
  }

  // ===================================================
  // SHOW PASSWORD
  // ===================================================

  function togglePassword() {
    const input = state.elements.password;
    const button = state.elements.passwordToggle;

    if (!input || !button) return;

    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    button.classList.toggle('is-visible', isPassword);
    button.setAttribute('aria-pressed', String(isPassword));
    button.setAttribute('aria-label', isPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi');
  }

  // ===================================================
  // FOCUS INPUT
  // ===================================================

  function handleInputFocus(event) {
    Animation.focusInput(event.currentTarget);
  }

  function handleInputBlur(event) {
    Animation.blurInput(event.currentTarget);
  }

  function handleInputChange(event) {
    UI.clearFieldError(event.currentTarget);
    UI.setMessage(state.elements.message, '');
  }

  // ===================================================
  // EVENT LISTENER
  // ===================================================

  function bindEvents() {
    state.elements.form.addEventListener('submit', submitLogin);

    [state.elements.username, state.elements.password].forEach((input) => {
      if (!input) return;

      input.addEventListener('focus', handleInputFocus);
      input.addEventListener('blur', handleInputBlur);
      input.addEventListener('input', handleInputChange);
    });

    if (state.elements.passwordToggle) {
      state.elements.passwordToggle.addEventListener('click', togglePassword);
    }

    if (state.elements.submit) {
      state.elements.submit.addEventListener('click', () => Animation.pressButton(state.elements.submit));
    }

    if (state.elements.forgotLink) {
      state.elements.forgotLink.addEventListener('click', (event) => {
        event.preventDefault();
        window.ForgotPassword.open();
      });
    }

    if (state.elements.ssoButton) {
      state.elements.ssoButton.addEventListener('click', () => {
        Animation.pressButton(state.elements.ssoButton);
        // SSO Kampus sedang dalam perbaikan: tampilkan halaman 503.
        window.location.href = '503.html';
      });
    }

    if (state.elements.modalClose) {
      state.elements.modalClose.addEventListener('click', UI.closeModal);
    }
  }
})();
