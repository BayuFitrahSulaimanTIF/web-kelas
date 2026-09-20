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

let argon2 = null;
let hashWasm = null;
try { argon2 = require('argon2'); } catch (e) { try { hashWasm = require('hash-wasm'); } catch {} }
const { env } = require('../config/env');

const HASH_OPTIONS = argon2 ? {
  type: argon2.argon2id,
  memoryCost: env.argon2.memoryKib,
  timeCost: env.argon2.iterations,
  parallelism: env.argon2.parallelism
} : null;

// Salurkan pepper ke dalam input sebelum hashing.
// Pepper tidak disimpan di database; pengelolaannya
// terpisah (variabel lingkungan).
function pepperedPassword(password) {
  return String(password || '') + env.security.passwordPepper;
}

// Hash password baru (register, reset, ganti kata sandi)
async function hashPassword(password) {
  const pp = pepperedPassword(password);
  if (argon2) return argon2.hash(pp, HASH_OPTIONS);
  if (hashWasm) {
    const { argon2id } = hashWasm;
    const salt = require('crypto').randomBytes(16);
    const hash = await argon2id({ password: pp, salt, parallelism: env.argon2.parallelism, iterations: env.argon2.iterations, memorySize: env.argon2.memoryKib, hashLength: 32, outputType: 'encoded' });
    return hash;
  }
  // fallback bcryptjs (pure JS, not blocked by WDAC)
  const bcrypt = require('bcryptjs');
  return bcrypt.hash(pp, 10);
}

// Verifikasi kata sandi saat login/SSO/ganti kata sandi
async function verifyPassword(hash, password) {
  if (!hash || !password) return false;
  try {
    const pp = pepperedPassword(password);
    if (hash.startsWith('$argon2')) {
      if (argon2) return await argon2.verify(hash, pp);
      if (hashWasm) {
        const { argon2Verify } = hashWasm;
        return await argon2Verify({ password: pp, hash });
      }
      return false;
    }
    // bcrypt fallback
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
      const bcrypt = require('bcryptjs');
      return await bcrypt.compare(pp, hash);
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Cek apakah hash lama sudah tidak sesuai parameter
// keamanan sekarang (untuk rehash otomatis saat login)
function needsRehash(hash) {
  try {
    if (!hash || !hash.startsWith('$argon2')) return true;
    if (argon2) return argon2.needsRehash(hash, HASH_OPTIONS);
    return true;
  } catch (error) {
    return true;
  }
}

module.exports = {
  hashPassword,
  verifyPassword,
  needsRehash
};