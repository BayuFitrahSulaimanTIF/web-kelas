// ===================================================
// LOGIN LEWAT GOOGLE
// Pustaka Google Identity Services yang menggambar tombolnya.
// Callback-nya mengirim ID token ke backend; backend yang
// verifikasi dan menerbitkan sesi. Client ID dibaca dari
// /auth/google/config supaya tidak ditulis ulang di sini.
// ===================================================

(function () {
  'use strict';

  const state = {
    isReady: false,
    isSubmitting: false,
    guardTimer: null,
    elements: {}
  };

  const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
  const CONNECT_TIMEOUT_MS = 20000;
  const CONNECT_POLL_MS = 400;
  const CONFIG_RETRY_MS = 800;
  const CONFIG_MAX_RETRY = 4;
  const LOGIN_RETRY_MS = 1200;
  const LOGIN_MAX_RETRY = 4;

  function selectDom() {
    state.elements = {
      wrap: document.getElementById('google-login'),
      mount: document.getElementById('google-signin-button')
    };
  }

  // Semua umpan balik login Google lewat toast di pojok kanan bawah,
  // sama seperti login email. Tidak ada lagi teks di dalam formulir.
  function showMessage(text, type) {
    if (text) UI.showToast(text, type || 'info');
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  // connectivity.js membungkus window.Api.request sehingga melempar
  // 'Offline' selama pemeriksaan koneksi masih berjalan. Statusnya
  // berubah lewat event app:connection, jadi tunggu di sini alih-alih
  // langsung meminta config dan gagal.
  function waitForServer() {
    if (window.Connectivity && window.Connectivity.isOnline()) return Promise.resolve(true);

    return new Promise((resolve) => {
      let settled = false;

      function finish(ok) {
        if (settled) return;
        settled = true;
        document.removeEventListener('app:connection', onChange);
        resolve(ok);
      }

      function onChange(event) {
        if (event.detail && event.detail.online) finish(true);
      }

      document.addEventListener('app:connection', onChange);

      // Jangan menggantung selamanya kalau connectivity.js tidak ada.
      window.setTimeout(() => finish(false), CONNECT_TIMEOUT_MS);
      window.setTimeout(function poll() {
        if (settled) return;
        if (window.Connectivity && window.Connectivity.isOnline()) {
          finish(true);
          return;
        }
        window.setTimeout(poll, CONNECT_POLL_MS);
      }, CONNECT_POLL_MS);
    });
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

  // Config hanya menentukan client ID dan apakah fiturnya hidup. Pakai
  // fetch biasa, bukan window.Api.request: yang itu melempar 'Offline'
  // selama connectivity.js masih memeriksa koneksi, padahal config tetap
  // bisa diambil begitu saja.
  async function fetchConfig() {
    const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL)
      || (window.location.origin + '/api');

    for (let attempt = 0; attempt <= CONFIG_MAX_RETRY; attempt++) {
      try {
        const response = await fetch(base + '/auth/google/config', {
          headers: { 'ngrok-skip-browser-warning': '1' },
          cache: 'no-store'
        });

        if (!response.ok) throw new Error('config ' + response.status);
        return await response.json();
      } catch (error) {
        if (attempt === CONFIG_MAX_RETRY) throw error;
        await wait(CONFIG_RETRY_MS);
      }
    }

    return null;
  }

  async function initialize() {
    selectDom();
    surfaceSilentErrors();

    if (!state.elements.wrap) return;

    // Unduh pustaka Google sekarang, paralel dengan ambil config.
    // Sebelumnya script baru diminta SETELAH config selesai, jadi unduhan
    // 275 KB itu berjalan sesudah satu putaran penuh ke server kita.
    const scriptPromise = loadGoogleScript();

    let config;
    try {
      config = await fetchConfig();
    } catch (error) {
      showMessage('Server belum terhubung. Login email tetap bisa dipakai.');
      return;
    }

    // GOOGLE_CLIENT_ID belum diisi: tombol memang sengaja disembunyikan.
    if (!config || !config.enabled || !config.clientId) {
      state.elements.wrap.hidden = true;
      return;
    }

    // Wadah boleh langsung terlihat; isinya yang menyusul.
    state.elements.wrap.hidden = false;

    try {
      const google = await scriptPromise;

      google.accounts.id.initialize({
        client_id: config.clientId,
        callback: handleCredential
      });

      // Wadah sudah terlihat di atas; renderButton() mengukur lebar induknya
      // dan tidak menggambar apa pun jika induknya masih display:none.
      //
      // Lebar 120 px adalah nilai terkecil yang diterima Google. Tombolnya
      // sendiri tidak terlihat: CSS_login.css mengecilkannya jadi bujur
      // sangkar 46 px dan membuatnya transparan, lalu meletakkannya di atas
      // ikon Google yang terlihat. Jadi yang diklik tetikus selalu tombol
      // asli Google, dan jendela login-nya tetap terbuka seperti biasa.
      google.accounts.id.renderButton(state.elements.mount, {
        theme: 'outline',
        size: 'large',
        width: 120,
        text: 'continue_with',
        locale: 'id'
      });

      // Label yang lebih jelas, karena yang tampil hanya ikon.
      const realButton = state.elements.mount.querySelector('[role="button"]');
      if (realButton) {
        realButton.setAttribute('aria-label', 'Masuk dengan Google');
      }

      state.isReady = true;
    } catch (error) {
      // Jangan hilang tanpa jejak. Origin yang belum didaftarkan di Google
      // Cloud Console memunculkan error 160 di sini; tampilkan agar bisa
      // dibaca, tanpa mengganggu login email.
      state.elements.mount.textContent = '';
      showMessage('Login dengan Google gagal dimuat. Periksa koneksi atau muat ulang halaman.');
    }
  }

  // Kirim kredensial ke backend.
  //
  // Popup Google menutup diri saat akun dipilih, dan itu membuat tab ini
  // kembali mendapat focus. connectivity.js langsung menjalankan checkNow()
  // dan sementara itu state = 'checking', sedangkan window.Api.request
  // melempar 'Offline' selama state bukan 'online'. Lewati ngrok, health
  // check butuh 1-3 detik, jadi request kita pasti ditolak di jendela itu.
  //
  // ID token Google masih sah sekitar satu jam dan bisa diverifikasi
  // berulang kali, jadi menunggu lalu mencoba ulang aman.
  async function exchangeCredential(idToken) {
    const body = JSON.stringify({ token: idToken });

    for (let attempt = 0; attempt <= LOGIN_MAX_RETRY; attempt++) {
      await waitForServer();

      try {
        return await window.Api.request('/auth/google', {
          method: 'POST',
          body
        });
      } catch (error) {
        const offline = /offline/i.test(String(error && error.message));
        if (!offline || attempt === LOGIN_MAX_RETRY) throw error;
        await wait(LOGIN_RETRY_MS * (attempt + 1));
      }
    }

    return null;
  }

  async function handleCredential(response) {
    if (state.isSubmitting) return;

    const idToken = response && response.credential;
    if (!idToken) return;

    state.isSubmitting = true;
    showMessage('Memverifikasi akun Google...', 'success');

    // Jaring pengaman: kalau nanti ternyata tidak pindah halaman, beri
    // tahu apa yang terjadi daripada diam saja.
    state.guardTimer = window.setTimeout(() => {
      if (state.isSubmitting) {
        showMessage('Google sudah mengirim akun, tapi server belum membalas. Muat ulang halaman lalu coba lagi.');
      }
    }, 15000);

    try {
      const data = await exchangeCredential(idToken);

      window.clearTimeout(state.guardTimer);
      state.guardTimer = null;

      saveAuthSession(data);

      const note = data.isNewAccount
        ? 'Akun dibuat dari Google, masuk...'
        : 'Login berhasil, mengalihkan...';

      showMessage(note, 'success');
      UI.showToast(note, 'success');

      window.setTimeout(() => {
        window.location.href = APP_CONFIG.ROUTES.dashboard;
      }, 650);
    } catch (error) {
      window.clearTimeout(state.guardTimer);
      state.guardTimer = null;

      const message = error.network || error.abort
        ? error.message
        : error.message || 'Login dengan Google gagal';

      showMessage(message);
      UI.showToast(message, 'error');
    } finally {
      state.isSubmitting = false;
    }
  }

  // Google's popup sering gagal tanpa satu pesan pun di halaman: origin
  // yang belum terdaftar di Google Cloud Console, FedCM yang ditolak
  // browser, atau popup yang diblokir. Semua itu dilempar sebagai error
  // global. Tulis ke halaman supaya tidak jadi "tidak ada yang terjadi".
  function surfaceSilentErrors() {
    const texts = {
      160: 'Origin ini belum terdaftar di Google Cloud Console (Authorized JavaScript origins).',
      189: 'Client ID Google tidak valid atau tombol belum aktif.',
      2: 'Popup login Google diblokir browser. Izinkan popup untuk situs ini.',
      3: 'Jendela login Google ditutup sebelum selesai.'
    };

    function describe(error) {
      if (!error) return 'Kesalahan tidak diketahui';
      const code = Number(error.code || error.error_code);
      if (texts[code]) return texts[code];
      if (/fedcm/i.test(String(error.type) + String(error.message))) {
        return 'Browser memblokir FedCM dari Google. Coba nonaktifkan fitur experimental browser.';
      }
      return String(error.message || 'Kesalahan tidak diketahui');
    }

    window.addEventListener('error', (event) => {
      const error = event.error;
      const raw = (error && (error.message || error.code)) || event.message || '';
      const match = /(\d{3})/.exec(String(raw));
      if (!match && !/fedcm/i.test(String(raw))) return;
      showMessage('Login Google gagal: ' + describe({ message: match ? match[0] : raw, code: match && match[1] }));
    });

    window.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      if (!reason) return;
      showMessage('Login Google gagal: ' + describe(reason));
    });
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

  // Skrip ini berada di akhir <body>, jadi wadah #google-login sudah ada
  // pada saat baris ini dieksekusi. Menunggu DOMContentLoaded akan menunda
  // semua ini sampai seluruh CSS, gambar, dan font halaman selesai dimuat
  // (terukur 4,2 detik pada muat pertama lewat ngrok). Mulai sekarang saja.
  if (document.getElementById('google-login')) {
    initialize();
  } else {
    document.addEventListener('DOMContentLoaded', initialize);
  }
})();