// ===================================================
// ACCOUNT TOKEN (15 karakter acak)
// Token internal acak untuk tiap akun. Bukan pengganti
// password_hash; hanya identifier internal opsional.
// Menggunakan crypto.randomBytes (kriptografis acak),
// bukan turunan deterministik dari email+password.
// ===================================================

const crypto = require('crypto');

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const TOKEN_LENGTH = 15;

function randomToken(length = TOKEN_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let token = '';

  for (let i = 0; i < length; i++) {
    token += CHARSET[bytes[i] % CHARSET.length];
  }

  return token;
}

module.exports = {
  CHARSET,
  TOKEN_LENGTH,
  generateAccountToken: randomToken,
  generateRandomCode: randomToken
};