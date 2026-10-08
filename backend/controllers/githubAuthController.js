// ===================================================
// LOGIN LEWAT GITHUB (OAuth 2.0 web application flow)
// Berbeda dengan Google yang memakai ID token, GitHub tidak punya
// ID token: yang ditukar tetap "authorization code", dan penukarannya
// MEMBUTUHKAN client secret. Karena itu tombol di frontend cukup
// redirect ke /start, tanpa popup.
//
// Alur:
//   /start   -> simpan state acak di cookie, arahkan ke GitHub
//   /callback-> cek state, tukar code jadi access token, ambil profil,
//               pakai/daftarkan akun, terbitkan sesi, arahkan ke frontend
//
// Bagian bersama dengan Facebook ada di utils/oauthWebFlow.js.
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const { AppError } = require('../utils/errors');
const { generateAccountToken } = require('../utils/accountToken');
const { applyNimFromEmail } = require('../utils/nimFromEmail');
const { publicOrigin } = require('../utils/publicOrigin');
const { saveGitHubPicture } = require('../utils/googleAvatar');
const {
  STATE_MAX_AGE_MS, randomState, readCookie, stateCookieHeader,
  frontendRedirect, backToLogin, postForm, requestJson,
  usernameFromName, uniqueUsername
} = require('../utils/oauthWebFlow');
const { env } = require('../config/env');
const authController = require('./authController');

const STATE_COOKIE = 'github_oauth_state';
const COOKIE_PATH = '/api/auth/github';

function github() {
  const { clientId, clientSecret } = env.github;

  if (!clientId || !clientSecret) {
    throw new AppError(503, 'Login dengan GitHub belum dikonfigurasi');
  }

  return { clientId, clientSecret };
}

function callbackUrl(req) {
  return env.github.callbackUrl
    || (publicOrigin(req) + '/api/auth/github/callback');
}

// GitHub menaruh token di header Authorization, jadi tidak sama dengan
// Graph API yang memakai query string.
function getJson(url, accessToken) {
  return requestJson(url, {
    headers: {
      Authorization: 'Bearer ' + accessToken,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }, 'GitHub');
}

// Email utama GitHub bisa saja null (kalau privacy email), jadi cari yang
// sudah diverifikasi lebih dulu.
function pickEmail(emails) {
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
  const state = randomState();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl(req),
    scope: 'read:user user:email',
    state,
    allow_signup: 'true'
  });

  res.setHeader('Set-Cookie', stateCookieHeader(req, COOKIE_PATH, STATE_COOKIE, state, STATE_MAX_AGE_MS));
  res.redirect(`https://github.com/login/oauth/authorize?${params}`);
});

// ===================================================
// GET /api/auth/github/callback
// ===================================================

exports.callback = asyncHandler(async (req, res) => {
  const { clientId, clientSecret } = github();

  if (req.query.error) {
    backToLogin(req, res, 'github', String(req.query.error_description || req.query.error));
    return;
  }

  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const expected = readCookie(req, STATE_COOKIE);

  res.setHeader('Set-Cookie', stateCookieHeader(req, COOKIE_PATH, STATE_COOKIE, '', 0));

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

  const email = pickEmail(emails);
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
      username: await uniqueUsername(User, usernameFromName(fullName, profile.login, email)),
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
    provider: 'github',
    welcome: isNewAccount ? '1' : ''
  });

  res.redirect(`${frontendRedirect(req)}?${params}`);
});