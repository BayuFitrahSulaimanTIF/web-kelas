// ===================================================
// PASSWORD CODEC
// Password disimpan dengan Argon2id (salt otomatis di
// dalam hash). Versi lama "ASCII + biner -> 15 karakter"
// dihapus karena bukan mekanisme pengamanan.
//
//   password ──> Argon2id (salt random, memory cost,
//                         iterasi, parallelism) + pepper
//                       ──> password_hash ($argon2id$...)
//
// Salt & parameter tersimpan dalam string hash, jadi
// tidak perlu kolom salt terpisah. Pepper dibaca dari
// .env (PASSWORD_PEPPER) dan TIDAK disimpan di database.
// ===================================================

const argon2 = require('argon2');
const { env } = require('../config/env');

const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: env.argon2.memoryKib,   // 19 MiB (rekomendasi OWASP minimum)
  timeCost: env.argon2.iterations,    // 2 iterasi
  parallelism: env.argon2.parallelism // 1 thread
};

// Salurkan pepper ke dalam input sebelum hashing.
// Pepper tidak disimpan di database; pengelolaannya
// terpisah (variabel lingkungan).
function pepperedPassword(password) {
  return String(password || '') + env.security.passwordPepper;
}

// Hash password baru (register, reset, ganti kata sandi)
async function hashPassword(password) {
  return argon2.hash(pepperedPassword(password), HASH_OPTIONS);
}

// Verifikasi kata sandi saat login/SSO/ganti kata sandi
async function verifyPassword(hash, password) {
  if (!hash || !password) return false;
  try {
    return await argon2.verify(hash, pepperedPassword(password));
  } catch (error) {
    return false;
  }
}

// Cek apakah hash lama sudah tidak sesuai parameter
// keamanan sekarang (untuk rehash otomatis saat login)
function needsRehash(hash) {
  try {
    return argon2.needsRehash(hash, HASH_OPTIONS);
  } catch (error) {
    return true;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash
};