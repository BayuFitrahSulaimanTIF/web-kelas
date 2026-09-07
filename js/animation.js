// ===================================================
// INITIALIZATION
// ===================================================

window.Animation = {
  // ===================================================
  // ANIMASI BUTTON
  // ===================================================

  pressButton(button) {
    if (!button) return;

    if (button.classList.contains('password-toggle')) {
      return;
    }

    button.classList.remove('animate-press');
    void button.offsetWidth;
    button.classList.add('animate-press');
  },

  // ===================================================
  // ANIMASI INPUT
  // ===================================================

  focusInput(input) {
    const field = input ? input.closest('.form-field') : null;
    if (field) {
      field.classList.add('is-focused');
    }
  },

  blurInput(input) {
    const field = input ? input.closest('.form-field') : null;
    if (field) {
      field.classList.remove('is-focused');
    }
  },

  // ===================================================
  // ANIMASI CARD
  // ===================================================

  shake(element) {
    if (!element) return;

    // Netralkan animasi dasar elemen (mis. fadeInUp pada .login-card)
    // yang tersisa dari cleanup getaran sebelumnya.
    element.style.animation = '';

    element.classList.remove('animate-shake');
    void element.offsetWidth;
    element.classList.add('animate-shake');

    // Hapus kelas setelah animasi selesai. Tanpa ini, kelas yang tersisa
    // akan memulai ulang getaran setiap kali elemen ditampilkan lagi
    // (mis. modal dibuka kembali setelah ditutup saat display: none).
    // Setelah kelas dihapus, animasi dasar elemen (mis. fadeInUp) akan
    // TER-REAPPLY dan dimulai ulang dari opacity 0 sehingga tampak
    // seperti halaman auto refresh. Karena itu kunci animasi elemen
    // dengan 'animation: none' setelah getaran selesai.
    element.addEventListener('animationend', function handleShakeEnd(event) {
      if (event.animationName !== 'shake') return;

      element.classList.remove('animate-shake');
      element.style.animation = 'none';
      element.removeEventListener('animationend', handleShakeEnd);
    });
  }
};
