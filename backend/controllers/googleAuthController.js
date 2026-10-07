// ===================================================
// LOGIN LEWAT GOOGLE (OIDC)
// Frontend menampilkan tombol Google Identity Services,
// lalu mengirim ID token miliknya ke endpoint ini.
// Backend memverifikasi tanda tangan token, mengambil
// email + nama + foto, lalu:
//   - akun dengan email yang sama  -> dipakai langsung
//   - belum ada                    -> didaftarkan otomatis
//   - email berformat nim@mhs.unesa.ac.id -> NIM ikut diisi ke users dan students
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const { AppError } = require('../utils/errors');
const { generateAccountToken } = require('../utils/accountToken');
const { isEnabled, verifyIdToken } = require('../utils/googleAuth');
const { applyNimFromEmail } = require('../utils/nimFromEmail');
const env = require('../config/env').env;
const authController = require('./authController');
const { saveGooglePicture } = require('../utils/googleAvatar');

// Samakan nama dari Google dengan aturan username di aplikasi
// (huruf, angka, titik, garis bawah, strip; spasi boleh).
function usernameFromName(name, email) {
  const cleaned = String(name || '')
    .replace(/[^a-zA-Z0-9._ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50);

  return cleaned || String(email || '').split('@')[0].slice(0, 50);
}

// Kalau nama sudah dipakai akun lain, tambahkan angka agar unik.
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

// ===================================================
// GET /api/auth/google/config
// Frontend memanggil ini dulu untuk tahu client ID
// dan apakah tombolnya perlu ditampilkan.
// ===================================================

exports.config = (req, res) => {
  res.json({
    enabled: isEnabled(),
    clientId: isEnabled() ? env.google.clientId : ''
  });
};

// ===================================================
// POST /api/auth/google
// Body: { token: "<id token dari Google>" }
// ===================================================

exports.login = asyncHandler(async (req, res) => {
  const idToken = String(req.body.token || '').trim();

  if (!idToken) {
    throw new AppError(400, 'Token Google wajib diisi');
  }

  let payload;
  try {
    payload = await verifyIdToken(idToken);
  } catch (error) {
    // Token ditolak Google (kedaluwarsa, audience beda, tanda tangan rusak).
    throw new AppError(401, 'Token Google tidak valid');
  }

  const googleId = String(payload.sub || '');
  const email = String(payload.email || '').trim().toLowerCase();
  const fullName = String(payload.name || '').trim();

  if (!googleId || !email) {
    throw new AppError(401, 'Data dari Google tidak lengkap');
  }

  if (payload.email_verified === false) {
    throw new AppError(401, 'Email Google belum diverifikasi');
  }

  if (env.google.allowedDomain) {
    const domain = email.split('@')[1] || '';
    if (domain.toLowerCase() !== env.google.allowedDomain.toLowerCase()) {
      throw new AppError(403, `Hanya email @${env.google.allowedDomain} yang bisa masuk`);
    }
  }

  let user = await User.findByGoogleId(googleId);
  let isNewAccount = false;

  if (!user) {
    // Email yang sudah pernah daftar (mis. dibuat manual) tetap dipakai,
    // lalu tautkan akun itu dengan identitas Google-nya.
    user = await User.findByEmail(email);

    if (user) {
      await User.linkGoogleId(user.id, googleId);
    }
  }

  if (!user) {
    const userId = await User.create({
      username: await uniqueUsername(usernameFromName(fullName, email)),
      email,
      passwordHash: null,
      accountToken: generateAccountToken(),
      full_name: fullName || null,
      role: 'mahasiswa',
      google_id: googleId
    });
    user = await User.findById(userId);
    isNewAccount = true;
  }

  if (!user.is_active) {
    throw new AppError(403, 'Akun tidak aktif. Hubungi administrator kampus');
  }

  await applyNimFromEmail(user, email, fullName);

  // Foto profil Google disimpan ke folder uploads/avatars supaya
  // kolom avatar yang sudah ada bisa memakainya di semua tampilan.
  if (payload.picture) {
    const filename = await saveGooglePicture(user.id, payload.picture);
    if (filename) await User.updateAvatar(user.id, filename);
  }

  await User.recordLoginSuccess(user.id);
  const refreshedUser = await User.findById(user.id);
  const { accessToken, refreshToken } = await authController.issueTokenPair(refreshedUser || user);

  res.json({
    message: 'Login berhasil',
    token: accessToken,
    refreshToken,
    isNewAccount,
    user: authController.sanitizeUser(refreshedUser || user)
  });
});