// ===================================================
// LOGIN LEWAT FACEBOOK (OAuth 2.0 web application flow)
//
// Seperti GitHub, Facebook tidak punya ID token: yang ditukar tetap
// "authorization code" dan penukarannya butuh app secret. Frontend
// cukup redirect ke /start, tanpa popup.
//
// Alur:
//   /start    -> simpan state acak di cookie, arahkan ke dialog Facebook
//   /callback -> cek state, tukar code jadi access token, baca profil
//               dari Graph API, pakai/daftarkan akun, terbitkan sesi
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const { AppError } = require('../utils/errors');
const { generateAccountToken } = require('../utils/accountToken');
const { applyNimFromEmail } = require('../utils/nimFromEmail');
const { saveGitHubPicture } = require('../utils/googleAvatar');
const { publicOrigin } = require('../utils/publicOrigin');
const {
  STATE_MAX_AGE_MS, randomState, readCookie, stateCookieHeader,
  frontendRedirect, backToLogin, postForm, getJsonWithToken,
  usernameFromName, uniqueUsername
} = require('../utils/oauthWebFlow');
const { env } = require('../config/env');
const authController = require('./authController');

const STATE_COOKIE = 'facebook_oauth_state';
const COOKIE_PATH = '/api/auth/facebook';
const GRAPH_VERSION = env.facebook.graphVersion || 'v21.0';

function facebook() {
  const { appId, appSecret, allowedDomain } = env.facebook;

  if (!appId || !appSecret) {
    throw new AppError(503, 'Login dengan Facebook belum dikonfigurasi');
  }

  return { appId, appSecret, allowedDomain };
}

function callbackUrl(req) {
  return env.facebook.callbackUrl
    || (publicOrigin(req) + '/api/auth/facebook/callback');
}

// ===================================================
// GET /api/auth/facebook/config
// ===================================================

exports.config = (req, res) => {
  res.json({
    enabled: Boolean(env.facebook.appId && env.facebook.appSecret),
    startUrl: '/api/auth/facebook/start'
  });
};

// ===================================================
// GET /api/auth/facebook/start
// ===================================================

exports.start = asyncHandler(async (req, res) => {
  const { appId } = facebook();
  const state = randomState();

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: callbackUrl(req),
    // Facebook menolak dialog dengan "Invalid Scopes: email" kalau scope
    // email dikirim. Email sekarang ikut sebagai field profil, jadi scope
    // yang benar hanya public_profile.
    scope: 'public_profile',
    state,
    response_type: 'code'
  });

  res.setHeader('Set-Cookie', stateCookieHeader(req, COOKIE_PATH, STATE_COOKIE, state, STATE_MAX_AGE_MS));
  res.redirect(`https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`);
});

// ===================================================
// GET /api/auth/facebook/callback
// ===================================================

exports.callback = asyncHandler(async (req, res) => {
  const { appId, appSecret, allowedDomain } = facebook();

  if (req.query.error) {
    backToLogin(req, res, 'facebook', String(req.query.error_description || req.query.error));
    return;
  }

  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const expected = readCookie(req, STATE_COOKIE);

  res.setHeader('Set-Cookie', stateCookieHeader(req, COOKIE_PATH, STATE_COOKIE, '', 0));

  if (!code || !state || !expected || state !== expected) {
    throw new AppError(400, 'Permintaan login Facebook tidak valid');
  }

  const tokenResponse = await postForm(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`, {
    client_id: appId,
    client_secret: appSecret,
    code,
    redirect_uri: callbackUrl(req)
  }).catch(() => {
    throw new AppError(502, 'Tidak bisa menghubungi Facebook');
  });

  if (tokenResponse.error || !tokenResponse.access_token) {
    throw new AppError(401, tokenResponse.error_description || 'Facebook menolak permintaan login');
  }

  const accessToken = tokenResponse.access_token;

  const profile = await getJsonWithToken(
    `https://graph.facebook.com/${GRAPH_VERSION}/me`,
    accessToken,
    'Facebook',
    { fields: 'id,name,email,picture.type(large)' }
  ).catch(() => {
    throw new AppError(502, 'Gagal membaca profil Facebook');
  });

  const email = String(profile.email || '').trim().toLowerCase();
  const fullName = String(profile.name || '').trim();
  const pictureUrl = profile.picture && profile.picture.data && profile.picture.data.url;

  if (!email) {
    throw new AppError(403, 'Akun Facebook tidak punya email yang bisa dipakai. Tambahkan email di aplikasi Facebook Anda.');
  }

  // Facebook hanya mengirim email yang sudah terverifikasi di sisi Facebook,
  // jadi sama seperti Google, domain kampus dibatasi bila di-set.
  if (allowedDomain) {
    const domain = email.split('@')[1] || '';
    if (domain.toLowerCase() !== allowedDomain.toLowerCase()) {
      throw new AppError(403, 'Login gagal. Gunakan Email Unesa!');
    }
  }

  // Disimpan di kolom yang sama dengan google_id supaya satu akun tidak
  // terdaftar dua kali.
  const facebookId = 'facebook:' + String(profile.id);

  let user = await User.findByGoogleId(facebookId);
  let isNewAccount = false;

  if (!user) {
    user = await User.findByEmail(email);

    if (user) {
      await User.linkGoogleId(user.id, facebookId);
    }
  }

  if (!user) {
    const userId = await User.create({
      username: await uniqueUsername(User, usernameFromName(fullName, '', email)),
      email,
      passwordHash: null,
      accountToken: generateAccountToken(),
      full_name: fullName || null,
      role: 'mahasiswa',
      google_id: facebookId
    });
    user = await User.findById(userId);
    isNewAccount = true;
  }

  if (!user.is_active) {
    throw new AppError(403, 'Akun tidak aktif. Hubungi administrator kampus');
  }

  await applyNimFromEmail(user, email, fullName);

  if (pictureUrl) {
    const saved = await saveGitHubPicture(user.id, pictureUrl);
    if (saved) await User.updateAvatar(user.id, saved);
  }

  await User.recordLoginSuccess(user.id);
  const refreshedUser = await User.findById(user.id);
  const { accessToken: sessionToken, refreshToken } = await authController.issueTokenPair(refreshedUser || user);

  const params = new URLSearchParams({
    token: sessionToken,
    refreshToken,
    provider: 'facebook',
    welcome: isNewAccount ? '1' : ''
  });

  res.redirect(`${frontendRedirect(req)}?${params}`);
});