(function () {
  'use strict';

  const state = {
    isSubmitting: false,
    lastFocused: null,
    closeTimer: null,
    elements: {}
  };

  const CLOSE_MS = 180;

  // ===================================================
  // INITIALIZATION
  // ===================================================

  document.addEventListener('DOMContentLoaded', initializeForgotPassword);

  function initializeForgotPassword() {
    selectDom();

    if (!state.elements.overlay) return;

    bindEvents();
  }

  // ===================================================
  // DOM SELECTOR
  // ===================================================

  function selectDom() {
    state.elements = {
      overlay: document.getElementById('forgot-overlay'),
      card: document.querySelector('.forgot-card'),
      form: document.getElementById('forgot-form'),
      input: document.getElementById('forgot-identifier'),
      back: document.getElementById('forgot-back'),
      close: document.getElementById('forgot-close'),
      backLogin: document.getElementById('forgot-backlogin'),
      submit: document.querySelector('.forgot-submit')
    };
  }

  // ===================================================
  // OPEN / CLOSE
  // ===================================================

  function openForgot() {
    const { overlay, input } = state.elements;

    if (!overlay) return;

    state.lastFocused = document.activeElement;

    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }

    overlay.classList.remove('is-closing');
    overlay.hidden = false;
    overlay.classList.add('is-open');

    if (input) {
      input.focus();
    }
  }

  function closeForgot() {
    const { overlay, input } = state.elements;

    if (!overlay || overlay.hidden) return;

    // Bersihkan kolom + pesan error agar tidak tersisa saat modal dibuka lagi
    if (input) {
      input.value = '';
    }
    UI.clearFieldError(input);

    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');

    state.closeTimer = window.setTimeout(() => {
      overlay.classList.remove('is-closing');
      overlay.hidden = true;
      state.closeTimer = null;

      if (state.lastFocused && typeof state.lastFocused.focus === 'function') {
        state.lastFocused.focus();
      }
    }, CLOSE_MS);
  }

  // ===================================================
  // SUBMIT
  // ===================================================

  async function submitForgot(event) {
    event.preventDefault();

    if (state.isSubmitting) return;

    const value = state.elements.input.value.trim();
    const error = Validator.validateUsername(value);

    UI.clearFieldError(state.elements.input);

    if (error) {
      UI.showFieldError(state.elements.input, error);
      Animation.shake(state.elements.card);
      return;
    }

    state.isSubmitting = true;
    UI.setButtonLoading(state.elements.submit, true);

    try {
      const result = await window.Api.request('/auth/check-identifier', {
        method: 'POST',
        body: JSON.stringify({ identifier: value })
      });

      if (!result.exists) {
        const isEmail = value.includes('@');
        UI.showFieldError(state.elements.input, isEmail ? 'Email tidak terdaftar.' : 'Username tidak terdaftar.');
        Animation.shake(state.elements.card);
        return;
      }

      localStorage.setItem(APP_CONFIG.STORAGE_KEYS.resetIdentifier, value);
      closeForgot();

      if (window.ResetPassword) {
        window.ResetPassword.open(value);
      }
    } catch (error) {
      if (error.network) {
        window.Connectivity.retryNow();
      }
      UI.showToast(error.message || 'Terjadi kesalahan, coba lagi', 'error');
    } finally {
      state.isSubmitting = false;
      UI.setButtonLoading(state.elements.submit, false);
    }
  }

  // ===================================================
  // EVENT LISTENER
  // ===================================================

  function handleInputChange() {
    UI.clearFieldError(state.elements.input);
  }

  function bindEvents() {
    state.elements.form.addEventListener('submit', submitForgot);
    state.elements.input.addEventListener('input', handleInputChange);
    state.elements.input.addEventListener('focus', () => Animation.focusInput(state.elements.input));
    state.elements.input.addEventListener('blur', () => Animation.blurInput(state.elements.input));

    [state.elements.back, state.elements.close, state.elements.backLogin].forEach((button) => {
      if (!button) return;

      button.addEventListener('click', () => {
        Animation.pressButton(button);
        closeForgot();
      });
    });

    state.elements.overlay.addEventListener('click', (event) => {
      if (event.target === state.elements.overlay) {
        closeForgot();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.elements.overlay && !state.elements.overlay.hidden) {
        closeForgot();
      }
    });
  }

  // ===================================================
  // EXPORT
  // ===================================================

  window.ForgotPassword = {
    open: openForgot,
    close: closeForgot
  };
})();
