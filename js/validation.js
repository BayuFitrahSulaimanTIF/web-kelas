// ===================================================
// INITIALIZATION
// ===================================================

window.Validator = {
  usernameMinLength: 3,
  usernameMaxLength: 100,
  passwordMinLength: 6,
  passwordMaxLength: 128,

  // ===================================================
  // VALIDASI EMAIL
  // ===================================================

  isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },

  // ===================================================
  // VALIDASI USERNAME
  // ===================================================

  isValidUsername(value) {
    return /^[a-zA-Z0-9._-]+$/.test(value);
  },

  validateUsername(value) {
    const username = String(value || '').trim();

    if (!username) {
      return 'Email atau username wajib diisi';
    }

    if (username.length < this.usernameMinLength) {
      return `Minimal ${this.usernameMinLength} karakter`;
    }

    if (username.length > this.usernameMaxLength) {
      return `Maksimal ${this.usernameMaxLength} karakter`;
    }

    if (username.includes('@') && !this.isValidEmail(username)) {
      return 'Format email tidak valid';
    }

    if (!username.includes('@') && !this.isValidUsername(username)) {
      return 'Username hanya boleh berisi huruf, angka, titik, garis bawah, atau strip';
    }

    return '';
  },

  // ===================================================
  // VALIDASI PASSWORD
  // ===================================================

  validatePassword(value) {
    const password = String(value || '');

    if (!password) {
      return 'Kata sandi wajib diisi';
    }

    if (password.length < this.passwordMinLength) {
      return `Minimal ${this.passwordMinLength} karakter`;
    }

    if (password.length > this.passwordMaxLength) {
      return `Maksimal ${this.passwordMaxLength} karakter`;
    }

    return '';
  },

  // ===================================================
  // VALIDATION
  // ===================================================

  validateLogin(formData) {
    const errors = {
      username: this.validateUsername(formData.username),
      password: this.validatePassword(formData.password)
    };

    Object.keys(errors).forEach((key) => {
      if (!errors[key]) {
        delete errors[key];
      }
    });

    return errors;
  }
};
