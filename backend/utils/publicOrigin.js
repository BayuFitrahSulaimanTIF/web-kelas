// ===================================================
// ASAL ORIGIN PUBLIK
//
// Tunnel (ngrok, devtunnels, lhr.life, ...) meneruskan
// X-Forwarded-Proto dan X-Forwarded-Host, jadi origin tempat
// pengguna benar-benar menjelajah tetap terlihat dari server
// walaupun FRONTEND_BASE_URL masih menunjuk ke localhost.
//
// Wajib: origin dari header hanya dipakai kalau cocok dengan
// daftar CORS_ORIGIN. Tanpa itu, penyerang bisa mengirim
// Host palsu lalu|RD mengarahkan login ke domain dia sendiri.
// ===================================================

const { env } = require('../config/env');

const PATTERNS = String(env.corsOrigin || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((p) => (p === '*'
    ? null
    : new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$')));

function isAllowedOrigin(origin) {
  if (!origin || origin === 'null') return true;

  return PATTERNS.some((re) => re === null || re.test(origin));
}

// ponytail: hanya X-Forwarded-Proto/Host yang dibaca (tunnel selalu
// mengirim keduanya). Kalau suatu saat ada proxy yang tidak
// mengisinya, hasilnya jatuh ke FRONTEND_BASE_URL.
function publicOrigin(req) {
  const header = (name) => String(req.get(name) || '').split(',')[0].trim();
  const proto = header('x-forwarded-proto') || req.protocol;
  const host = header('x-forwarded-host') || header('host');
  const candidate = host ? `${proto}://${host}` : '';

  if (candidate && isAllowedOrigin(candidate)) return candidate;

  return String(env.frontendBaseUrl || '').replace(/\/+$/, '');
}

module.exports = { isAllowedOrigin, publicOrigin };