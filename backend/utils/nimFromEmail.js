// ===================================================
// NIM DARI EMAIL KAMPUS
// Email UNESA memuat NIM di bagian sebelum '@':
//   25051204214@mhs.unesa.ac.id -> NIM 25051204214
// Dipakai oleh login Google dan login GitHub, supaya keduanya
// mengisi kolom NIM di tabel users dan students dengan cara sama.
// ===================================================

const User = require('../models/User');
const Student = require('../models/Student');
const PasswordCodec = require('./passwordCodec');
const { generateAccountToken } = require('./accountToken');

const NIM_FROM_EMAIL = /^(\d{8,15})@/;

// Dua digit awal NIM UNESA adalah tahun angkatan: 25... -> 2025.
function angkatanFromNim(nim) {
  const match = /^(\d{2})\d{8,13}$/.exec(nim);
  return match ? Number('20' + match[1]) : null;
}

function nimFromEmail(email) {
  const match = NIM_FROM_EMAIL.exec(String(email || '').trim());
  return match ? match[1] : null;
}

// Isi users.nim kalau masih kosong, lalu catat di tabel students.
//students yang sudah ada tidak ditimpa.
async function applyNimFromEmail(user, email, fullName) {
  const nim = nimFromEmail(email);
  if (!nim) return null;

  if (!user.nim) {
    await User.updateNim(user.id, nim);
    user.nim = nim;
  }

  // Kata sandi portal diacak dari token acak yang tidak pernah disimpan:
  // orang ini masuk lewat Google/GitHub, bukan SSO, jadi tidak ada yang
  // bisa memakai sandi placeholder itu.
  const placeholder = await PasswordCodec.hashPassword(generateAccountToken());

  await Student.upsertFromNim({
    nim,
    fullName: fullName || user.username,
    email,
    angkatan: angkatanFromNim(nim),
    programStudi: 'Teknik Informatika',
    ssoPasswordHash: placeholder
  });

  return nim;
}

module.exports = { nimFromEmail, applyNimFromEmail };