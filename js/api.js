// ===================================================
// API CLIENT (frontend)
// Satu-satunya tempat yang memanggil fetch. Semua error
// jaringan diterjemahkan ke pesan yang ramah (tidak ada
// lagi "Failed to fetch" mentah) dan diberi tanda:
//   - error.network : server tidak terjangkau
//   - error.abort   : timeout klien
//   - error.api     : respons error dari server (memiliki
//                     .status dan .message)
// ===================================================

(function () {
  'use strict';

  const baseUrl = window.APP_CONFIG.API_BASE_URL;

  async function request(path, options) {
    const opts = options || {};
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), window.APP_CONFIG.TIMEOUT_MS);

    const headers = Object.assign({ 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' }, opts.headers || {});
    // Token sesi (sessionStorage) disuntik otomatis untuk endpoint
    // yang butuh autentikasi (mis. /auth/me), kecuali sudah diatur.
    if (!headers.Authorization) {
      const token = sessionStorage.getItem(window.APP_CONFIG.STORAGE_KEYS.token);
      if (token) {
        headers.Authorization = 'Bearer ' + token;
      }
    }

    let response;
    let text;

    try {
      response = await fetch(baseUrl + path, {
        method: opts.method || 'GET',
        headers: headers,
        body: opts.body || undefined,
        signal: controller.signal
      });
      text = await response.text();
    } catch (error) {
      if (error && error.name === 'AbortError') {
        const abortError = new Error('Koneksi terlalu lama, coba lagi');
        abortError.abort = true;
        throw abortError;
      }

      const networkError = new Error('Tidak dapat terhubung ke server. Menghubungkan ulang secara otomatis...');
      networkError.network = true;
      throw networkError;
    } finally {
      window.clearTimeout(timeoutId);
    }

    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch (error) {
      data = { message: 'Format response server tidak valid' };
    }

    if (!response.ok) {
      const apiError = new Error(data.message || data.error || 'Terjadi kesalahan pada server');
      apiError.api = true;
      apiError.status = response.status;
      throw apiError;
    }

    return data;
  }

  window.Api = { request };
})();