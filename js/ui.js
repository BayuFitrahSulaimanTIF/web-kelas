// ===================================================
// INITIALIZATION
// ===================================================

window.UI = {
  // ===================================================
  // POPUP
  // ===================================================

  openModal(title, message) {
    const backdrop = document.getElementById('modal-backdrop');
    const titleEl = document.getElementById('modal-title');
    const messageEl = document.getElementById('modal-message');

    if (!backdrop || !titleEl || !messageEl) return;

    titleEl.textContent = title || 'Informasi';
    messageEl.textContent = message || '';
    backdrop.hidden = false;
  },

  closeModal() {
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) {
      backdrop.hidden = true;
    }
  },

  // ===================================================
  // TOAST
  // ===================================================

  showToast(message, type = 'info') {
    const root = document.getElementById('toast-root');
    if (!root || !message) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    root.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3600);
  },

  // ===================================================
  // LOADING
  // ===================================================

  setLoading(isLoading) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
      overlay.hidden = !isLoading;
    }
  },

  setButtonLoading(button, isLoading) {
    if (!button) return;

    if (isLoading) {
      if (!button.dataset.originalHtml) {
        button.dataset.originalHtml = button.innerHTML;
      }
      button.disabled = true;
      button.innerHTML = '<span class="spinner" aria-hidden="true"></span><span>Memproses</span>';
      return;
    }

    button.disabled = false;
    button.innerHTML = button.dataset.originalHtml || '<span>Masuk</span>';
  },

  // ===================================================
  // FIELD STATE
  // ===================================================

  showFieldError(input, message) {
    if (!input) return;

    const field = input.closest('.form-field');
    const errorEl = field ? field.querySelector('.field-error') : null;

    if (field) {
      field.classList.add('has-error');
    }

    if (errorEl) {
      errorEl.textContent = message;
    }
  },

  clearFieldError(input) {
    if (!input) return;

    const field = input.closest('.form-field');
    const errorEl = field ? field.querySelector('.field-error') : null;

    if (field) {
      field.classList.remove('has-error');
    }

    if (errorEl) {
      errorEl.textContent = '';
    }
  },

  clearAllFieldErrors(form) {
    if (!form) return;

    form.querySelectorAll('input').forEach((input) => this.clearFieldError(input));
  },

  setMessage(element, text, type = 'error') {
    if (!element) return;

    // Pertahankan kelas dasar elemen (mis. .login-message atau
    // .forgot-message); cukup ganti status sukses/error-nya.
    element.classList.toggle('success', type === 'success');
    element.textContent = text || '';
  }
};
