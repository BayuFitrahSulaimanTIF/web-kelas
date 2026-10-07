// ===================================================
// LOGIN LEWAT GITHUB (OAuth 2.0 web application flow)
// Berbeda dengan Google yang memakai ID token, GitHub tidak punya
// ID token: yang ditukar tetap "authorization code", dan penukarannya
// MEMBUTUHKAN client secret. Karena itu tombol di frontend cukup
// Redirect sederhana ke /start, tanpa popup.
//
// Alur:
//   /start   -> simpan state acak di cookie, arahkan ke GitHub
//   /callback-> cek state, tukar code jadi access token, ambil profil,
//               pakai/daftarkan akun, terbitkan sesi, arahkan ke frontend
// ===================================================

const crypto = require('crypto');
const https = require('https');

const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const { AppError } = require('../utils/errors');
const { generateAccountToken } = require('../utils/accountToken');
const { applyNimFromEmail } = require('../utils/nimFromEmail');
const { saveGitHubPicture } = require('../utils/googleAvatar');
const { env } = require('../config/env');
const authController = require('./authController');

const STATE_COOKIE = 'github_oauth_state';
const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function github() {
  const { clientId, clientSecret } = env.github;

  if (!clientId || !clientSecret) {
    throw new AppError(503, 'Login dengan GitHub belum dikonfigurasi');
  }

  return { clientId, clientSecret };
}

function callbackUrl(req) {
  return env.github.callbackUrl
    || (env.frontendBaseUrl.replace(/\/+$/, '') + '/api/auth/github/callback');
}

// Panggilan HTTPS tanpa pustaka luar: satu file saja, tanpa dependensi.
function postForm(url, form) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = new URLSearchParams(form).toString();

    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'Web-Kelas',
          'Content-Length': Buffer.byteLength(body)
        },
        timeout: 10000
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (error) { reject(new Error('Balasan GitHub tidak bisa dibaca')); }
        });
      }
    );

    req.on('timeout', () => { req.destroy(); reject(new Error('GitHub tidak menjawab')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJson(url, accessToken) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + accessToken,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Web-Kelas',
          'X-GitHub-Api-Version': '2022-11-28'
        },
        timeout: 10000
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try { resolve(JSON.parse(raw)); } catch (error) { reject(new Error('Balasan GitHub tidak bisa dibaca')); }
        });
      }
    );

    req.on('timeout', () => { req.destroy(); reject(new Error('GitHub tidak menjawab')); });
    req.on('error', reject);
    req.end();
  });
}

function cookieHeader(name, value, maxAgeMs) {
  const parts = [
    `${name}=${value}`,
    'Path=/api/auth/github',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.round(maxAgeMs / 1000)}`
  ];

  if (env.frontendBaseUrl.startsWith('https://')) parts.push('Secure');

  return parts.join('; ');
}

function frontendRedirect(req, res) {
  const base = env.frontendBaseUrl.replace(/\/+$/, '');
  return `${base}/sso-callback.html`;
}

function backToLogin(req, res, reason) {
  const base = env.frontendBaseUrl.replace(/\/+$/, '');
  res.redirect(`${base}/index.html?${new URLSearchParams({ github: reason })}`);
}

// Samakan nama GitHub dengan aturan username di aplikasi.
function usernameFromName(name, login, email) {
  const cleaned = String(name || '')
    .replace(/[^a-zA-Z0-9._ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return cleaned || String(login || email || '').slice(0, 50);
}

async function uniqueUsername(base) {
  let candidate = base;
  let suffix = 1;

  while (await User.isUsernameTaken(candidate)) {
    suffix += 1;
    const tail = ' ' + suffix;
    candidate = base.slice(0, 50 - tail.length) + tail;
  }

  return candidate;
}

// Email utama GitHub bisa saja null (kalau privacy email), jadi cari yang
// sudah diverifikasi lebih dulu.
function pickEmail(profile, emails) {
  const list = Array.isArray(emails) ? emails : [];
  const primary = list.find((item) => item && item.primary && item.verified);
  const anyVerified = list.find((item) => item && item.verified);
  const primaryAny = list.find((item) => item && item.primary);

  return (primary || anyVerified || primaryAny || {}).email || null;
}

// ===================================================
// GET /api/auth/github/config
// ===================================================

exports.config = (req, res) => {
  res.json({
    enabled: Boolean(env.github.clientId && env.github.clientSecret),
    startUrl: '/api/auth/github/start'
  });
};

// ===================================================
// GET /api/auth/github/start
// ===================================================

exports.start = asyncHandler(async (req, res) => {
  const { clientId } = github();
  const state = crypto.randomBytes(16).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(req),
    scope: 'read:user user:email',
    state,
    allow_signup: 'true'
  });

  res.setHeader('Set-Cookie', cookieHeader(STATE_COOKIE, state, STATE_MAX_AGE_MS));
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ===================================================
// GET /api/auth/github/callback
// ===================================================

exports.callback = asyncHandler(async (req, res) => {
  const { clientId, clientSecret } = github();

  if (req.query.error) {
    backToLogin(req, res, String(req.query.error_description || req.query.error));
    return;
  }

  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const expected = String(req.cookies[STATE_COOKIE] || '');

  res.setHeader('Set-Cookie', cookieHeader(STATE_COOKIE, '', 0));

  if (!code || !state || !expected || state !== expected) {
    throw new AppError(400, 'Permintaan login GitHub tidak valid');
  }

  const tokenResponse = await postForm('https://github.com/login/oauth/access_token', {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: callbackUrl(req)
  }).catch(() => {
    throw new AppError(502, 'Tidak bisa menghubungi GitHub');
  });

  if (tokenResponse.error || !tokenResponse.access_token) {
    throw new AppError(401, tokenResponse.error_description || 'GitHub menolak permintaan login');
  }

  const accessToken = tokenResponse.access_token;

  const profile = await getJson('https://api.github.com/user', accessToken).catch(() => {
    throw new AppError(502, 'Gagal membaca profil GitHub');
  });

  const emails = await getJson('https://api.github.com/user/emails', accessToken)
    .catch(() => []);

  const email = pickEmail(profile, emails);
  const fullName = String(profile.name || '').trim();

  if (!email) {
    throw new AppError(403, 'Akun GitHub tidak punya email yang bisa dipakai');
  }

  // github_id disimpan di kolom yang sama dengan google_id supaya satu akun
  // tidak terdaftar dua kali.
  const githubId = 'github:' + String(profile.id);

  let user = await User.findByGoogleId(githubId);
  let isNewAccount = false;

  if (!user) {
    user = await User.findByEmail(email);

    if (user) {
      await User.linkGoogleId(user.id, githubId);
    }
  }

  if (!user) {
    const userId = await User.create({
      username: await uniqueUsername(usernameFromName(fullName, profile.login, email)),
      email,
      passwordHash: null,
      accountToken: generateAccountToken(),
      full_name: fullName || null,
      role: 'mahasiswa',
      google_id: githubId
    });
    user = await User.findById(userId);
    isNewAccount = true;
  }

  if (!user.is_active) {
    throw new AppError(403, 'Akun tidak aktif. Hubungi administrator kampus');
  }

  await applyNimFromEmail(user, email, fullName);

  if (profile.avatar_url) {
    const saved = await saveGitHubPicture(user.id, profile.avatar_url);
    if (saved) await User.updateAvatar(user.id, saved);
  }

  await User.recordLoginSuccess(user.id);
  const refreshedUser = await User.findById(user.id);
  const { accessToken: sessionToken, refreshToken } = await authController.issueTokenPair(refreshedUser || user);

  const params = new URLSearchParams({
    token: sessionToken,
    refreshToken,
    welcome: isNewAccount ? '1' : ''
  });

  res.redirect(`${frontendRedirect(req, res)}?${params}`);
});