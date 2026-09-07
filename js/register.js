(function () {
  'use strict';

  // ===================================================
  // REGISTER (DAFTAR AKUN)
  // Alur 5 langkah: username+nama -> email -> tanggal lahir+gender -> role+matkul -> kata sandi
  // - Role: student/admin; admin wajib pilih matkul penanggung jawab
  // - Kata sandi: min 8, huruf besar/kecil/angka/simbol !@#$%^&*()
  // - Konfirmasi harus sama, jika tidak -> "kata sandi tidak sama"
  // - Username dicek ketersediaannya di tahap 1
  // - Sukses: tutup modal, akun tersimpan (role+course jika admin)
  // ===================================================

  const state = {
    step: 1,
    isSubmitting: false,
    lastFocused: null,
    closeTimer: null,
    data: {
      username: '',
      first_name: '',
      last_name: '',
      email: '',
      birth_date: '',
      gender: '',
      role: '',
      managed_course: ''
    },
    elements: {}
  };

  const CLOSE_MS = 180;

  // ===================================================
  // INITIALIZATION
  // ===================================================

  document.addEventListener('DOMContentLoaded', initializeRegister);

  function initializeRegister() {
    selectDom();

    if (!state.elements.overlay) return;

    bindEvents();

    if (state.elements.birthDate) {
      DatePicker.attach(state.elements.birthDate);
    }

    showStep(1);
  }

  // ===================================================
  // DOM SELECTOR
  // ===================================================

  function selectDom() {
    state.elements = {
      overlay: document.getElementById('register-overlay'),
      card: document.querySelector('.register-card'),
      link: document.getElementById('register-link'),
      back: document.getElementById('register-back'),
      close: document.getElementById('register-close'),
      backLogin: document.getElementById('register-backlogin'),
      steps: [1, 2, 3, 4, 5].map((n) => document.getElementById('register-step-' + n)),
      formUsername: document.getElementById('register-form-username'),
      formEmail: document.getElementById('register-form-email'),
      formProfile: document.getElementById('register-form-profile'),
      formRole: document.getElementById('register-form-role'),
      formPassword: document.getElementById('register-form-password'),
      username: document.getElementById('register-username'),
      firstName: document.getElementById('register-first-name'),
      lastName: document.getElementById('register-last-name'),
      email: document.getElementById('register-email'),
      birthDate: document.getElementById('register-birth-date'),
      genderButtons: document.querySelectorAll('.gender-card[data-gender]'),
      roleButtons: document.querySelectorAll('.gender-card[data-role]'),
      managedCourse: document.getElementById('register-managed-course'),
      adminCourseField: document.getElementById('admin-course-field'),
      password: document.getElementById('register-password'),
      confirmPassword: document.getElementById('register-confirm-password'),
      togglePassword: document.getElementById('register-toggle-password'),
      toggleConfirm: document.getElementById('register-toggle-confirm'),
      submit: document.getElementById('register-submit'),
      nextUsername: document.getElementById('register-next-username'),
      nextRole: document.getElementById('register-next-role'),
      message: document.getElementById('register-message')
    };
  }

  // ===================================================
  // STEP NAVIGATION
  // ===================================================

  function showStep(step) {
    state.step = step;

    const { formUsername, formEmail, formProfile, formRole, formPassword } = state.elements;

    formUsername.hidden = step !== 1;
    formEmail.hidden = step !== 2;
    formProfile.hidden = step !== 3;
    if (formRole) formRole.hidden = step !== 4;
    formPassword.hidden = step !== 5;

    state.elements.steps.forEach((dot, index) => {
      if (dot) dot.classList.toggle('is-active', index < step);
    });

    if (step === 1 && state.elements.username) {
      state.elements.username.focus();
    } else if (step === 2 && state.elements.email) {
      state.elements.email.focus();
    } else if (step === 3 && state.elements.birthDate) {
      state.elements.birthDate.focus();
    } else if (step === 4 && state.elements.roleButtons && state.elements.roleButtons[0]) {
      state.elements.roleButtons[0].focus();
    } else if (step === 5 && state.elements.password) {
      state.elements.password.focus();
    }
  }

  function goBack() {
    if (state.step > 1) {
      showStep(state.step - 1);
    } else {
      closeRegister();
    }
  }

  // ===================================================
  // OPEN / CLOSE
  // ===================================================

  function openRegister() {
    const { overlay } = state.elements;

    if (!overlay) return;

    state.lastFocused = document.activeElement;

    if (state.closeTimer) {
      window.clearTimeout(state.closeTimer);
      state.closeTimer = null;
    }

    DatePicker.close();
    resetForm();
    overlay.classList.remove('is-closing');
    overlay.hidden = false;
    overlay.classList.add('is-open');
    showStep(1);
  }

  function closeRegister() {
    const { overlay } = state.elements;

    if (!overlay || overlay.hidden) return;

    DatePicker.close();
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
    state.data = { username: '', first_name: '', last_name: '', email: '', birth_date: '', gender: '', role: '', managed_course: '' };

    [state.elements.username, state.elements.firstName, state.elements.lastName, state.elements.email, state.elements.birthDate, state.elements.password, state.elements.confirmPassword].forEach((el) => {
      if (el) el.value = '';
    });
    if (state.elements.managedCourse) state.elements.managedCourse.value = '';
    if (state.elements.adminCourseField) state.elements.adminCourseField.hidden = true;

    state.elements.genderButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });
    if (state.elements.roleButtons) state.elements.roleButtons.forEach((button) => {
      button.classList.remove('is-active');
      button.setAttribute('aria-pressed', 'false');
    });

    [state.elements.formUsername, state.elements.formEmail, state.elements.formProfile, state.elements.formRole, state.elements.formPassword].forEach((form) => {
      if (form) UI.clearAllFieldErrors(form);
    });

    if (state.elements.genderButtons[0]) {
      UI.clearFieldError(state.elements.genderButtons[0]);
    }
    if (state.elements.roleButtons && state.elements.roleButtons[0]) {
      UI.clearFieldError(state.elements.roleButtons[0]);
    }

    UI.setMessage(state.elements.message, '');
  }

  // ===================================================
  // STEP 1: USERNAME + NAMA DEPAN/BELAKANG
  // ===================================================

  async function submitUsername(event) {
    event.preventDefault();

    if (state.isSubmitting) return;

    const { username, firstName, lastName, formUsername } = state.elements;

    UI.clearAllFieldErrors(formUsername);

    const usernameValue = username.value.trim();
    const firstValue = firstName.value.trim();
    const lastValue = lastName.value.trim();

    const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/;

    if (!usernameValue) {
      UI.showFieldError(username, 'Username wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    if (!USERNAME_PATTERN.test(usernameValue)) {
      UI.showFieldError(username, 'Username 3-50 karakter (huruf, angka, titik, garis bawah, strip)');
      Animation.shake(state.elements.card);
      return;
    }

    if (!firstValue) {
      UI.showFieldError(firstName, 'Nama depan wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    if (!lastValue) {
      UI.showFieldError(lastName, 'Nama belakang wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    state.isSubmitting = true;
    UI.setButtonLoading(state.elements.nextUsername, true);

    try {
      const result = await window.Api.request('/auth/check-identifier', {
        method: 'POST',
        body: JSON.stringify({ username: usernameValue })
      });

      if (result && result.exists) {
        UI.showFieldError(username, 'Username sudah digunakan');
        Animation.shake(state.elements.card);
        return;
      }

      state.data.username = usernameValue;
      state.data.first_name = firstValue;
      state.data.last_name = lastValue;
      showStep(2);
    } catch (error) {
      if (error.network) {
        window.Connectivity.retryNow();
      }
      UI.showToast(error.message || 'Gagal memeriksa username', 'error');
      Animation.shake(state.elements.card);
    } finally {
      state.isSubmitting = false;
      UI.setButtonLoading(state.elements.nextUsername, false);
    }
  }

  // ===================================================
  // STEP 1: EMAIL
  // ===================================================

  function submitEmail(event) {
    event.preventDefault();

    const { email } = state.elements;
    const value = email.value.trim();

    UI.clearAllFieldErrors(state.elements.formEmail);

    if (!value) {
      UI.showFieldError(email, 'Alamat email wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!EMAIL_PATTERN.test(value)) {
      UI.showFieldError(email, 'Format email tidak valid');
      Animation.shake(state.elements.card);
      return;
    }

    state.data.email = value.toLowerCase();
    showStep(3);
  }

  // ===================================================
  // STEP 3: TANGGAL LAHIR + GENDER
  // ===================================================

  function submitProfile(event) {
    event.preventDefault();

    const { birthDate, genderButtons, formProfile } = state.elements;

    UI.clearAllFieldErrors(formProfile);

    const value = birthDate.value.trim();
    const birthError = validateBirthDate(value);

    if (birthError) {
      UI.showFieldError(birthDate, birthError);
      Animation.shake(state.elements.card);
      return;
    }

    if (!state.data.gender) {
      UI.showFieldError(genderButtons[0], 'Pilih jenis kelamin');
      Animation.shake(state.elements.card);
      return;
    }

    state.data.birth_date = value;
    showStep(4);
  }

  function selectRole(button) {
    state.data.role = button.dataset.role;
    if (state.elements.adminCourseField) {
      const isAdmin = state.data.role === 'admin';
      state.elements.adminCourseField.hidden = !isAdmin;
      if (!isAdmin && state.elements.managedCourse) state.elements.managedCourse.value = '';
    }
    state.elements.roleButtons.forEach((btn) => {
      const active = btn === button;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    UI.clearFieldError(button);
    if (state.elements.managedCourse) UI.clearFieldError(state.elements.managedCourse);
  }

  function submitRole(event) {
    event.preventDefault();
    const { formRole, roleButtons, managedCourse } = state.elements;
    UI.clearAllFieldErrors(formRole);
    if (!state.data.role) {
      UI.showFieldError(roleButtons[0], 'Pilih peran');
      Animation.shake(state.elements.card);
      return;
    }
    if (state.data.role === 'admin') {
      const val = managedCourse ? managedCourse.value.trim() : '';
      if (!val) {
        UI.showFieldError(managedCourse, 'Pilih mata kuliah penanggung jawab');
        Animation.shake(state.elements.card);
        return;
      }
      state.data.managed_course = val;
    } else {
      state.data.managed_course = '';
    }
    showStep(5);
  }

  function selectGender(button) {
    state.data.gender = button.dataset.gender;

    state.elements.genderButtons.forEach((btn) => {
      const active = btn === button;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    UI.clearFieldError(button);
  }

  function validateBirthDate(value) {
    if (!value) return 'Tanggal lahir wajib diisi';
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return 'Format tanggal harus dd/mm/yyyy';

    const [dd, mm, yyyy] = value.split('/').map(Number);

    if (yyyy < 1900 || yyyy > 2008) return 'Tanggal lahir tidak valid';
    if (mm < 1 || mm > 12) return 'Bulan tidak valid';

    const daysInMonth = new Date(yyyy, mm, 0).getDate();
    if (dd < 1 || dd > daysInMonth) return 'Tanggal tidak valid';

    return '';
  }

  // ===================================================
  // STEP 3: PASSWORD
  // ===================================================

  async function submitPassword(event) {
    event.preventDefault();

    if (state.isSubmitting) return;

    const { password, confirmPassword, formPassword } = state.elements;

    UI.clearAllFieldErrors(formPassword);
    UI.setMessage(state.elements.message, '');

    const passwordValue = password.value;
    const confirmValue = confirmPassword.value;

    const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*()]).{8,128}$/;

    if (!passwordValue) {
      UI.showFieldError(password, 'Kata sandi wajib diisi');
      Animation.shake(state.elements.card);
      return;
    }

    if (!PASSWORD_PATTERN.test(passwordValue)) {
      UI.showFieldError(password, 'Tidak memenuhi syarat kata sandi!');
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
    UI.setButtonLoading(state.elements.submit, true);

    try {
      await window.Api.request('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          username: state.data.username,
          first_name: state.data.first_name,
          last_name: state.data.last_name,
          email: state.data.email,
          birth_date: state.data.birth_date,
          gender: state.data.gender,
          role: state.data.role || 'student',
          managed_course: state.data.managed_course || ''
        })
      });

      UI.showToast('Akun berhasil dibuat', 'success');
      closeRegister();
    } catch (error) {
      if (error.network) {
        window.Connectivity.retryNow();
      }
      UI.showToast(error.message || 'Gagal membuat akun', 'error');
      Animation.shake(state.elements.card);
    } finally {
      state.isSubmitting = false;
      UI.setButtonLoading(state.elements.submit, false);
    }
  }

  // ===================================================
  // PASSWORD TOGGLE
  // ===================================================

  function togglePasswordVisibility() {
    const input = state.elements.password;
    const button = state.elements.togglePassword;
    const isPassword = input.type === 'password';

    input.type = isPassword ? 'text' : 'password';
    button.classList.toggle('is-visible', isPassword);
    button.setAttribute('aria-pressed', String(isPassword));
  }

  function toggleConfirmVisibility() {
    const input = state.elements.confirmPassword;
    const button = state.elements.toggleConfirm;
    const isPassword = input.type === 'password';

    input.type = isPassword ? 'text' : 'password';
    button.classList.toggle('is-visible', isPassword);
    button.setAttribute('aria-pressed', String(isPassword));
  }

  // ===================================================
  // EVENT LISTENER
  // ===================================================

  function bindEvents() {
    state.elements.link.addEventListener('click', (event) => {
      event.preventDefault();
      Animation.pressButton(state.elements.link);
      openRegister();
    });

    state.elements.formUsername.addEventListener('submit', submitUsername);
    state.elements.formEmail.addEventListener('submit', submitEmail);
    state.elements.formProfile.addEventListener('submit', submitProfile);
    state.elements.formPassword.addEventListener('submit', submitPassword);

    state.elements.genderButtons.forEach((button) => {
      button.addEventListener('click', () => selectGender(button));
    });

    if (state.elements.roleButtons) state.elements.roleButtons.forEach((button) => {
      button.addEventListener('click', () => selectRole(button));
    });
    if (state.elements.formRole) state.elements.formRole.addEventListener('submit', submitRole);
    if (state.elements.managedCourse) state.elements.managedCourse.addEventListener('change', () => UI.clearFieldError(state.elements.managedCourse));

    state.elements.back.addEventListener('click', () => {
      Animation.pressButton(state.elements.back);
      goBack();
    });

    [state.elements.close, state.elements.backLogin].forEach((button) => {
      button.addEventListener('click', () => {
        Animation.pressButton(button);
        closeRegister();
      });
    });

    state.elements.overlay.addEventListener('click', (event) => {
      if (event.target === state.elements.overlay) {
        closeRegister();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && state.elements.overlay && !state.elements.overlay.hidden) {
        closeRegister();
      }
    });

    if (state.elements.togglePassword) {
      state.elements.togglePassword.addEventListener('click', togglePasswordVisibility);
    }

    if (state.elements.toggleConfirm) {
      state.elements.toggleConfirm.addEventListener('click', toggleConfirmVisibility);
    }
  }

  // ===================================================
  // EXPORT
  // ===================================================

  window.Register = {
    open: openRegister,
    close: closeRegister
  };
})();
