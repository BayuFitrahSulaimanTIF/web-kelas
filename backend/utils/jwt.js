// ===================================================
// UTILITAS JWT
// - Access token  : umur pendek, JWT_SECRET
// - Refresh token : umur panjang, REFRESH_TOKEN_SECRET
//                  (secret terpisah; hash-nya disimpan di DB)
// ===================================================

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

function signPayload(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn });
}

function verifyToken(token, secret) {
  return jwt.verify(token, secret);
}

function createAccessToken(user) {
  return signPayload(
    { id: user.id, username: user.username, role: user.role },
    env.jwt.secret,
    env.jwt.accessExpiresIn
  );
}

function createRefreshToken(user) {
  return signPayload(
    { id: user.id, type: 'refresh' },
    env.jwt.refreshSecret,
    env.jwt.refreshExpiresIn
  );
}

// Hash SHA-256 refresh token sebelum disimpan ke database
// agar token yang bocor dari DB tidak bisa dipakai langsung.
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Durasi hidup refresh token dalam milidetik
function refreshTokenTtlMs() {
  const match = String(env.jwt.refreshExpiresIn).match(/^(\d+)([smhd])$/);
  if (!match) return 7 * 24 * 60 * 60 * 1000;

  const value = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * multipliers[unit];
}

module.exports = {
  createAccessToken,
  createRefreshToken,
  verifyToken,
  hashToken,
  refreshTokenTtlMs
};
