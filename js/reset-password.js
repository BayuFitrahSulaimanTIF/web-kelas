(function () {
  'use strict';

  const state = {
    isSubmitting: false,
    identifier: '',
    lastFocused: null,
    closeTimer: null,
    elements: {}
  };

  const CLOSE_MS = 180;

  const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*()]).{8,128}$/;

  // ===================================================
  // INITIALIZATION
  // ===================================================

  document.addEventListener('DOMContentLoaded', initializeResetPassword);

  function initializeResetPassword() {
    selectDom();

    if (!state.elements.overlay) return;

    bindEvents();
  }

  // ===================================================
  // DOM SELECTOR
  // ===================================================

  function selectDom() {
    state.elements = {
      overlay: document.getElementById('reset-overlay'),
      card: document.querySelector('.reset-card'),
      form: document.getElementById('reset-form'),
      accountValue: document.getElementById('reset-account-value'),
      newPassword: document.getElementById('reset-new-password'),
      confirmPassword: document.getElementById('reset-confirm-password'),
      toggleNew: document.getElementById('reset-toggle-new'),
      toggleConfirm: document.getElementById('reset-toggle-confirm'),
      message: document.getElementById('reset-message'),
      back: document.getElementById('reset-back'),
      close: document.getElementById('reset-close')
    };
  }

  // ===================================================
  // OPEN / CLOSE
  // ===================================================

  function openReset(identifier) {
    const { overlay } = state.elements;

    if (!overlay) return;

    state.identifier = identifier || '';

    if (state.elements.accountValue) {
      state.elements.accountValue.textContent = state.identifier;
    }

    state.lastFocused = document.activeElement;

    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }

    resetForm();
    overlay.classList.remove('is-closing');
    overlay.hidden = false;
    overlay.classList.add('is-open');

    if (state.elements.newPassword) {
      state.elements.newPassword.focus();
    }
  }

  function closeReset() {
    const { overlay } = state.elements;

    if (!overlay || overlay.hidden) return;

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

  function resetForm() {
    [state.elements.newPassword, state.elements.confirmPassword].forEach((input) => {
      if (input) input.value = '';
    });

    [state.elements.newPassword, state.elements.confirmPassword].forEach((input) => {
      if (input) UI.clearFieldError(input);
    });

    UI.setMessage(state.elements.message, '');
  }

  // ===================================================
  // SUBMIT
  // ===================================================

  async function submitReset(event) {
    event.preventDefault();

    if (state.isSubmitting) return;

    const { newPassword, confirmPassword, form } = state.elements;

    UI.clearFieldError(newPassword);
    UI.clearFieldError(confirmPassword);
    UI.setMessage(state.elements.message, '');

    const passwordValue = newPassword.value;
    const confirmValue = confirmPassword.value;

    if (!passwordValue) {
      UI.showFieldError(newPassword, 'Kata sandi baru wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    if (!PASSWORD_PATTERN.test(passwordValue)) {
      UI.showFieldError(newPassword, 'Tidak memenuhi syarat kata sandi!');
      Animation.shake(state.elements.card);
      return;
    }

    if (!confirmValue) {
      UI.showFieldError(confirmPassword, 'Ulangi kata sandi wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    if (passwordValue !== confirmValue) {
      UI.showFieldError(confirmPassword, 'kata sandi tidak sama');
      Animation.shake(state.elements.card);
      return;
    }

    state.isSubmitting = true;
    UI.setButtonLoading(state.elements.form.querySelector('.forgot-submit'), true);

    try {
      await window.Api.request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          identifier: state.identifier,
          newPassword: passwordValue
        })
      });

      localStorage.removeItem(APP_CONFIG.STORAGE_KEYS.resetIdentifier);
      UI.showToast('Kata sandi berhasil diubah. Silakan masuk.', 'success');
      closeReset();
    } catch (error) {
      if (error.network) {
        window.Connectivity.retryNow();
      }
      const message = error.message || 'Gagal mengatur ulang kata sandi';
      UI.setMessage(state.elements.message, message);
      UI.showToast(message, 'error');
    } finally {
      state.isSubmitting = false;
      UI.setButtonLoading(state.elements.form.querySelector('.forgot-submit'), false);
    }
  }

  // ===================================================
  // PASSWORD TOGGLE
  // ===================================================

  function toggleVisibility(input, button) {
    const isPassword = input.type === 'password';

    input.type = isPassword ? 'text' : 'password';
    button.classList.toggle('is-visible', isPassword);
    button.setAttribute('aria-pressed', String(isPassword));
  }

  // ===================================================
  // EVENT LISTENER
  // ===================================================

  function bindEvents() {
    state.elements.form.addEventListener('submit', submitReset);

    [state.elements.newPassword, state.elements.confirmPassword].forEach((input) => {
      input.addEventListener('input', () => UI.clearFieldError(input));
      input.addEventListener('focus', () => Animation.focusInput(input));
      input.addEventListener('blur', () => Animation.blurInput(input));
    });

    state.elements.toggleNew.addEventListener('click', () => {
      Animation.pressButton(state.elements.toggleNew);
      toggleVisibility(state.elements.newPassword, state.elements.toggleNew);
    });

    state.elements.toggleConfirm.addEventListener('click', () => {
      Animation.pressButton(state.elements.toggleConfirm);
      toggleVisibility(state.elements.confirmPassword, state.elements.toggleConfirm);
    });

    state.elements.back.addEventListener('click', () => {
      Animation.pressButton(state.elements.back);
      closeReset();
      if (window.ForgotPassword) {
        window.ForgotPassword.open();
      }
    });

    state.elements.close.addEventListener('click', () => {
      Animation.pressButton(state.elements.close);
      closeReset();
    });

    state.elements.overlay.addEventListener('click', (event) => {
      if (event.target === state.elements.overlay) {
        closeReset();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.elements.overlay && !state.elements.overlay.hidden) {
        closeReset();
      }
    });
  }

  // ===================================================
  // EXPORT
  // ===================================================

  window.ResetPassword = {
    open: openReset,
    close: closeReset
  };
})();
