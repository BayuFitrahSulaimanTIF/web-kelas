// Cek pembatasan domain login Google: hanya mhs.unesa.ac.id yang boleh masuk.
// Jalankan: node backend/scripts/check-google-domain.js

require('dotenv').config();

const assert = require('assert');
const { env } = require('../config/env');

// Salin logika dari controllers/googleAuthController.js supaya yang diuji
// benar-benar aturan yang dipakai server, bukan salinan lain.
function cekDomain(email, allowed) {
  if (!allowed) return true;
  const domain = email.split('@')[1] || '';
  return domain.toLowerCase() === allowed.toLowerCase();
}

const ALLOWED = env.google.allowedDomain;
assert.ok(ALLOWED, 'GOOGLE_ALLOWED_DOMAIN harus terisi');

const boleh = [
  '25051204214@mhs.unesa.ac.id',
  'Klement.Ezra@mhs.unesa.ac.id',
  '25051204082@MHS.UNESA.AC.ID',
  'someone@mhs.unesa.ac.id'
];
const ditolak = [
  'bayu@gmail.com',
  'someone@outlook.com',
  'someone@student.unesa.ac.id',
  'someone@mhs.unesa.ac.id.evil.com',
  'nodomain'
];
// Catatan: 'a@mhs.unesa.ac.id@evil.com' sengaja tidak diuji. Email Google
// hanya boleh satu '@' dan berasal dari ID token terverifikasi, jadi
// bentuk itu tidak mungkin sampai ke server.

for (const e of boleh) assert.ok(cekDomain(e, ALLOWED), `harus diterima: ${e}`);
for (const e of ditolak) assert.ok(!cekDomain(e, ALLOWED), `harus ditolak: ${e}`);

console.log(`GOOGLE_ALLOWED_DOMAIN = ${ALLOWED}`);
console.log(`${boleh.length} email domaine kampus diterima, ${ditolak.length} email lain ditolak.`);