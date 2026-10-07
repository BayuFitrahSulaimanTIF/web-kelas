// Cek origin publik: memastikan tunnel terbaca dan Host palsu ditolak.
// Jalankan: node backend/scripts/check-public-origin.js

require('dotenv').config();

const assert = require('assert');
const { isAllowedOrigin, publicOrigin } = require('../utils/publicOrigin');

function fakeReq(headers) {
  return {
    protocol: 'http',
    get: (name) => headers[name] || '',
  };
}

const tunnel = 'https://cranium-feeble-encroach.ngrok-free.dev';

// 1. Di localhost tanpa header tunnel -> tetap localhost.
assert.strictEqual(
  publicOrigin(fakeReq({ host: 'localhost:3000' })),
  'http://localhost:3000'
);

// 2. Lewat tunnel -> Ikuti origin publik yang sedang dipakai.
assert.strictEqual(
  publicOrigin(fakeReq({
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'cranium-feeble-encroach.ngrok-free.dev',
    host: 'localhost:3000',
  })),
  tunnel
);

// 3. Host palsu dari penyerang -> TIDAK boleh dipakai sebagai tujuan redirect.
assert.strictEqual(
  publicOrigin(fakeReq({ host: 'penyerang.example.com' })),
  'http://localhost:3000'
);
assert.strictEqual(
  publicOrigin(fakeReq({
    'x-forwarded-proto': 'https',
    'x-forwarded-host': 'penyerang.example.com',
    host: 'localhost:3000',
  })),
  'http://localhost:3000'
);

// 4. Beberapa proxy menumpuk -> yang pertama yang dipakai.
assert.strictEqual(
  publicOrigin(fakeReq({
    'x-forwarded-proto': 'https, http',
    'x-forwarded-host': 'cranium-feeble-encroach.ngrok-free.dev, internal:3000',
  })),
  tunnel
);

// 5. Tanpa Origin (klik langsung, curl) -> tidak diblokir.
assert.strictEqual(isAllowedOrigin(''), true);
assert.strictEqual(isAllowedOrigin(tunnel), true);
assert.strictEqual(isAllowedOrigin('https://penyerang.example.com'), false);

console.log('publicOrigin: 5 kelompok pemeriksaan lulus.');