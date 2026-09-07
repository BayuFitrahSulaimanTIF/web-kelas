// ===================================================
// AUTH CONTROLLER
// - Login dengan lockout akun setelah N percobaan gagal
// - Token pair: access (JWT) + refresh (hash di DB, rotasi)
// - Register, reset password, ganti password, logout
// - Password disimpan dengan Argon2id (+pepper dari .env),
//   bukan lagi "kode 15 karakter dari email+password"
// - account_token: 15 karakter acak (identifier internal)
// ===================================================

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const PasswordCodec = require('../utils/passwordCodec');
const { AVATAR_DIR } = require('../utils/avatarUpload');
const { generateAccountToken } = require('../utils/accountToken');
const { AppError } = require('../utils/errors');
const { env } = require('../config/env');
const {
  createAccessToken,
  createRefreshToken,
  verifyToken,
  hashToken,
  refreshTokenTtlMs
} = require('../utils/jwt');
const {
  validateLogin,
  validateRegister,
  validateResetPassword,
  validateChangePassword,
  validateProfileUpdate
} = require('../validators/authValidators');

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    full_name: user.full_name,
    role: user.role,
    status: user.is_active ? 'active' : 'inactive',
    last_login_at: user.last_login_at || null,
    birth_date: user.birth_date || null,
    gender: user.gender || null,
    bio: user.bio || null,
    avatar: user.avatar || null
  };
}

// Terbitkan access token + refresh token (hash refresh disimpan di DB)
async function issueTokenPair(user) {
  const accessToken = createAccessToken(user);
  const refreshToken = createRefreshToken(user);

  const expiresAt = new Date(Date.now() + refreshTokenTtlMs());
  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt
  });

  return { accessToken, refreshToken };
}

function isLocked(user) {
  if (!user.locked_until) return false;
  return new Date(user.locked_until).getTime() > Date.now();
}

function isActiveUser(user) {
  return Number(user.is_active) === 1 || user.is_active === true;
}

// ===================================================
// POST /api/auth/login
// ===================================================

exports.login = asyncHandler(async (req, res) => {
  const errors = validateLogin(req.body);
  if (Object.keys(errors).length > 0) {
    throw new AppError(400, 'Email/username dan kata sandi wajib diisi', errors);
  }

  const identifier = String(req.body.username || req.body.email || '').trim();
  const password = String(req.body.password || '');

  const user = await User.findByUsernameOrEmail(identifier);
  if (!user) {
    throw new AppError(401, 'Email/username atau kata sandi salah');
  }

  if (!isActiveUser(user)) {
    throw new AppError(403, 'Akun tidak aktif. Hubungi administrator kampus');
  }

  if (isLocked(user)) {
    throw new AppError(423, 'Akun terkunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam beberapa menit');
  }

  if (user.locked_until && !isLocked(user)) {
    await User.clearLock(user.id);
  }

  const passwordMatch = await PasswordCodec.verifyPassword(user.password_hash, password);
  if (!passwordMatch) {
    await User.recordLoginFailure(user.id);

    const { loginMaxAttempts, loginLockoutMinutes } = env.security;
    const attempts = user.failed_login_attempts + 1;

    if (attempts >= loginMaxAttempts) {
      await User.lockAccount(user.id, loginLockoutMinutes);
      throw new AppError(
        423,
        `Terlalu banyak percobaan gagal. Akun dikunci selama ${loginLockoutMinutes} menit`
      );
    }

    throw new AppError(
      401,
      `Email/username atau kata sandi salah (percobaan ${attempts}/${loginMaxAttempts})`
    );
  }

  await User.recordLoginSuccess(user.id);
  const refreshedUser = await User.findById(user.id);
  const { accessToken, refreshToken } = await issueTokenPair(refreshedUser || user);

  res.json({
    message: 'Login berhasil',
    token: accessToken,
    refreshToken,
    user: sanitizeUser(refreshedUser || user)
  });
});

// ===================================================
// POST /api/auth/register
// ===================================================

exports.register = asyncHandler(async (req, res) => {
  const errors = validateRegister(req.body);
  if (Object.keys(errors).length > 0) {
    throw new AppError(422, 'Validasi gagal', errors);
  }

  const email = String(req.body.email).trim().toLowerCase();
  const password = String(req.body.password);
  const birthDate = String(req.body.birth_date).trim();
  const gender = String(req.body.gender).trim();
  const username = String(req.body.username || '').trim();
  const firstName = String(req.body.first_name || '').trim();
  const lastName = String(req.body.last_name || '').trim();

  const existingEmail = await User.findByEmail(email);
  if (existingEmail) {
    throw new AppError(409, 'Email sudah terdaftar');
  }

  const existingUsername = await User.findByUsername(username);
  if (existingUsername) {
    throw new AppError(409, 'Username sudah digunakan');
  }

  // Hash Argon2id (salt otomatis + pepper dari .env)
  const passwordHash = await PasswordCodec.hashPassword(password);

  // Identifier internal acak 15 karakter (bukan turunan password)
  const accountToken = generateAccountToken();

  // Tanggal lahir (dd/mm/yyyy) dikonversi ke format MySQL (YYYY-MM-DD)
  const [birthDd, birthMm, birthYyyy] = birthDate.split('/');
  const birthDateDb = `${birthYyyy}-${birthMm}-${birthDd}`;

  const userId = await User.create({
    username,
    email,
    full_name: `${firstName} ${lastName}`.trim(),
    passwordHash,
    accountToken,
    role: 'student',
    birth_date: birthDateDb,
    gender
  });

  const createdUser = await User.findById(userId);
  res.status(201).json({
    message: 'Akun berhasil dibuat',
    user: sanitizeUser(createdUser)
  });
});

// ===================================================
// GET /api/auth/me (wajib access token)
// ===================================================

exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new AppError(404, 'User tidak ditemukan');
  }

  res.json({ user: sanitizeUser(user) });
});

// ===================================================
// PUT /api/auth/profile (wajib access token)
// Memperbarui profil pengguna (saat ini: bio deskripsi)
// ===================================================

exports.updateProfile = asyncHandler(async (req, res) => {
  const errors = validateProfileUpdate(req.body);
  if (Object.keys(errors).length > 0) {
    throw new AppError(422, 'Validasi gagal', errors);
  }

  const bio = String(req.body.bio || '').trim();

  await User.updateBio(req.user.id, bio || null);

  const updatedUser = await User.findById(req.user.id);
  res.json({
    message: 'Profil berhasil diperbarui',
    user: sanitizeUser(updatedUser)
  });
});

// ===================================================
// POST /api/auth/avatar (wajib access token; multer di rute)
// Menyimpan foto profil hasil crop dari klien (jpg/jpeg/png)
// ===================================================

exports.uploadAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    fs.unlink(req.file.path, () => {});
    throw new AppError(404, 'Pengguna tidak ditemukan');
  }

  // Hapus foto lama (jika ada) agar tidak menumpuk di server
  if (user.avatar) {
    fs.unlink(path.join(AVATAR_DIR, user.avatar), () => {});
  }

  await User.updateAvatar(req.user.id, req.file.filename);

  const updatedUser = await User.findById(req.user.id);
  res.json({
    message: 'Foto profil berhasil diperbarui',
    user: sanitizeUser(updatedUser)
  });
});

// ===================================================
// DELETE /api/auth/avatar (wajib access token)
// Menghapus foto profil; avatar kembali ke inisial nama
// ===================================================

exports.deleteAvatar = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    throw new AppError(404, 'Pengguna tidak ditemukan');
  }

  if (user.avatar) {
    fs.unlink(path.join(AVATAR_DIR, user.avatar), () => {});
  }

  await User.updateAvatar(req.user.id, null);

  const updatedUser = await User.findById(req.user.id);
  res.json({
    message: 'Foto profil dihapus',
    user: sanitizeUser(updatedUser)
  });
});

// ===================================================
// POST /api/auth/reset-password
// ===================================================

exports.resetPassword = asyncHandler(async (req, res) => {
  const errors = validateResetPassword(req.body);
  if (Object.keys(errors).length > 0) {
    throw new AppError(422, 'Validasi gagal', errors);
  }

  const identifier = String(req.body.identifier || req.body.username || req.body.email || '').trim();
  const newPassword = String(req.body.newPassword);

  const user = await User.findByUsernameOrEmail(identifier);
  if (!user) {
    throw new AppError(404, 'Akun tidak ditemukan. Periksa email/username Anda');
  }

  const passwordHash = await PasswordCodec.hashPassword(newPassword);
  await User.updatePassword(user.id, passwordHash);
  await RefreshToken.deleteByUserId(user.id);

  res.json({ message: 'Kata sandi berhasil diperbarui. Silakan masuk dengan kata sandi baru' });
});

// ===================================================
// POST /api/auth/check-identifier
// Cek apakah email/username terdaftar (alur lupa kata sandi)
// ===================================================

exports.checkIdentifier = asyncHandler(async (req, res) => {
  const identifier = String(req.body.identifier || req.body.email || req.body.username || '').trim();

  if (!identifier) {
    throw new AppError(400, 'Email/username wajib diisi');
  }

  const user = await User.findByUsernameOrEmail(identifier);

  res.json({ exists: Boolean(user) });
});

// ===================================================
// POST /api/auth/change-password (wajib access token)
// ===================================================

exports.changePassword = asyncHandler(async (req, res) => {
  const errors = validateChangePassword(req.body);
  if (Object.keys(errors).length > 0) {
    throw new AppError(422, 'Validasi gagal', errors);
  }

  const user = await User.findByUsername(req.user.username);
  if (!user) {
    throw new AppError(404, 'User tidak ditemukan');
  }

  const currentPassword = String(req.body.currentPassword);
  const passwordMatch = await PasswordCodec.verifyPassword(user.password_hash, currentPassword);
  if (!passwordMatch) {
    throw new AppError(401, 'Kata sandi saat ini salah');
  }

  const passwordHash = await PasswordCodec.hashPassword(String(req.body.newPassword));
  await User.updatePassword(user.id, passwordHash);
  await RefreshToken.deleteByUserId(user.id);

  res.json({ message: 'Kata sandi berhasil diubah. Silakan masuk kembali' });
});

// ===================================================
// POST /api/auth/refresh
// Rotasi refresh token: yang lama dihapus, terbitkan pasangan baru
// ===================================================

exports.refresh = asyncHandler(async (req, res) => {
  const refreshToken = String(req.body.refreshToken || '').trim();
  if (!refreshToken) {
    throw new AppError(400, 'Refresh token wajib diisi');
  }

  let decoded;
  try {
    decoded = verifyToken(refreshToken, env.jwt.refreshSecret);
  } catch (error) {
    throw new AppError(401, 'Refresh token tidak valid atau kadaluarsa');
  }

  if (decoded.type !== 'refresh') {
    throw new AppError(401, 'Refresh token tidak valid');
  }

  const stored = await RefreshToken.findByHash(hashToken(refreshToken));
  if (!stored) {
    throw new AppError(401, 'Refresh token tidak dikenali. Silakan masuk kembali');
  }

  if (new Date(stored.expires_at).getTime() <= Date.now()) {
    await RefreshToken.deleteById(stored.id);
    throw new AppError(401, 'Refresh token kadaluarsa. Silakan masuk kembali');
  }

  // Rotasi: hapus token lama sebelum terbitkan yang baru
  await RefreshToken.deleteById(stored.id);

  const user = await User.findById(stored.user_id);
  if (!user) {
    throw new AppError(401, 'Akun tidak ditemukan. Silakan masuk kembali');
  }

  if (!isActiveUser(user)) {
    throw new AppError(403, 'Akun tidak aktif');
  }

  const { accessToken, refreshToken: newRefreshToken } = await issueTokenPair(user);

  res.json({
    message: 'Token diperbarui',
    token: accessToken,
    refreshToken: newRefreshToken,
    user: sanitizeUser(user)
  });
});

// ===================================================
// POST /api/auth/logout
// ===================================================

exports.logout = asyncHandler(async (req, res) => {
  const refreshToken = String(req.body.refreshToken || '').trim();
  if (!refreshToken) {
    throw new AppError(400, 'Refresh token wajib diisi');
  }

  await RefreshToken.deleteByUserId(req.user.id);
  res.json({ message: 'Logout berhasil' });
});

// ===================================================
// SHARED (dipakai SSO)
// ===================================================

exports.sanitizeUser = sanitizeUser;
exports.issueTokenPair = issueTokenPair;