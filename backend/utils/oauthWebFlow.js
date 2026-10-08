// ===================================================
// DASHBOARD OAuth LENGKAP (authorization code flow)
//
// Google memakai ID token dan cukup diverifikasi, tapi GitHub dan
// Facebook tidak punya ID token: yang ditukar tetap "authorization
// code", dan penukarannya MEMBUTUHKAN client secret. Keduanya juga
// butuh cookie state untuk mencegah login paksa (CSRF).
//
// Bagian yang sama dari kedua flow itu dikumpulkan di sini supaya
// tidak disalin dua kali. Panggilan HTTPS memakai modul https bawaan
// Node, jadi tidak ada dependensi baru.
// ===================================================

const crypto = require('crypto');
const https = require('https');

const { publicOrigin } = require('./publicOrigin');

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const USER_AGENT = 'Web-Kelas';

function randomState() {
  return crypto.randomBytes(16).toString('hex');
}

// ponytail: hanya cookie milik flow ini sendiri yang dibaca, jadi tidak
// perlu menambah dependensi cookie-parser untuk satu nilai.
function readCookie(req, name) {
  const hit = String(req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name}=`));

  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : '';
}

// Path dibatasi ke prefix provider supaya cookie GitHub tidak ikut
// terkirim ke endpoint Facebook (dan sebaliknya).
function stateCookieHeader(req, cookiePath, name, value, maxAgeMs) {
  const parts = [
    `${name}=${value}`,
    `Path=${cookiePath}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.round(maxAgeMs / 1000)}`
  ];

  if (publicOrigin(req).startsWith('https://')) parts.push('Secure');

  return parts.join('; ');
}

function frontendRedirect(req) {
  return `${publicOrigin(req)}/sso-callback.html`;
}

function backToLogin(req, res, provider, reason) {
  res.redirect(`${publicOrigin(req)}/index.html?${new URLSearchParams({ [provider]: reason })}`);
}

function requestJson(url, options, provider, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: target.pathname + target.search,
        method: options.method || 'GET',
        headers: Object.assign({ 'User-Agent': USER_AGENT, Accept: 'application/json' }, options.headers),
        timeout: timeoutMs
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(raw); } catch (error) {
            reject(new Error(`Balasan ${provider} tidak bisa dibaca`));
            return;
          }
          resolve(parsed);
        });
      }
    );

    req.on('timeout', () => { req.destroy(); reject(new Error(`${provider} tidak menjawab`)); });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function postForm(url, form) {
  const body = new URLSearchParams(form).toString();
  return requestJson(url, {
    method: 'POST',
    body,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body)
    }
  }, 'OAuth');
}

// Token di query string dipakai Graph API, bukan header Authorization.
function getJsonWithToken(url, accessToken, provider, extraHeaders) {
  const target = new URL(url);
  target.searchParams.set('access_token', accessToken);

  return requestJson(target.toString(), { headers: extraHeaders || {} }, provider);
}

// Samakan nama dari penyedia dengan aturan username di aplikasi.
function usernameFromName(name, fallbackLogin, email) {
  const cleaned = String(name || '')
    .replace(/[^a-zA-Z0-9._ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return cleaned || String(fallbackLogin || email || '').slice(0, 50);
}

// Kalau nama sudah dipakai akun lain, tambahkan angka agar unik.
async function uniqueUsername(User, base) {
  let candidate = base;
  let suffix = 1;

  while (await User.isUsernameTaken(candidate)) {
    suffix += 1;
    const tail = ' ' + suffix;
    candidate = base.slice(0, 50 - tail.length) + tail;
  }

  return candidate;
}

module.exports = {
  STATE_MAX_AGE_MS,
  randomState,
  readCookie,
  stateCookieHeader,
  frontendRedirect,
  backToLogin,
  postForm,
  requestJson,
  getJsonWithToken,
  usernameFromName,
  uniqueUsername
};