// ===================================================
// KONFIGURASI TERPUSAT
// Membaca .env sekali, memvalidasi, dan menyediakan
// semua nilai konfigurasi lewat satu modul.
// ===================================================

const logger = require('../utils/logger');

const env = {
  port: Number(process.env.PORT || 3000),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    name: process.env.DB_NAME || 'university_class_system'
  },
  jwt: {
    secret: process.env.JWT_SECRET || '',
    // Secret TERPISAH untuk refresh token (boleh sama hanya
    // jika tidak diatur, demi kompatibilitas .env lama)
    refreshSecret: process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET || '',
    accessExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },
  argon2: {
    // Parameter Argon2id (rekomendasi minimum OWASP: 19 MiB, 2 iterasi, 1)
    memoryKib: Number(process.env.ARGON2_MEMORY_KIB || 19456),
    iterations: Number(process.env.ARGON2_ITERATIONS || 2),
    parallelism: Number(process.env.ARGON2_PARALLELISM || 1)
  },
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  frontendBaseUrl: process.env.FRONTEND_BASE_URL || 'http://localhost:3000',
  security: {
    loginMaxAttempts: Number(process.env.LOGIN_MAX_ATTEMPTS || 5),
    loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 5),
    // Pepper: nilai rahasia yang DICAMPURKAN ke password
    // sebelum di-hash. Tidak disimpan di database.
    passwordPepper: process.env.PASSWORD_PEPPER || ''
  }
};

function validateEnv() {
  const missing = [];

  if (!env.jwt.secret) {
    missing.push('JWT_SECRET');
  }

  if (!env.security.passwordPepper) {
    missing.push('PASSWORD_PEPPER');
  }

  if (missing.length > 0) {
    logger.error(`Variabel lingkungan wajib belum diatur: ${missing.join(', ')}`);
    process.exit(1);
  }

  if (env.jwt.secret === 'ganti_dengan_secret_rahasia') {
    logger.warn('JWT_SECRET masih memakai nilai bawaan. Gunakan secret acak untuk produksi!');
  }

  if (env.security.passwordPepper.length < 16) {
    logger.warn('PASSWORD_PEPPER terlalu pendek. Gunakan minimal 16 karakter acak!');
  }

  if (env.argon2.memoryKib < 19456) {
    logger.warn('ARGON2_MEMORY_KIB di bawah 19456 (19 MiB). Hash kurang tahan brute force!');
  }

  if (env.argon2.iterations < 2) {
    logger.warn('ARGON2_ITERATIONS di bawah 2. Hash kurang tahan brute force!');
  }

  if (env.security.loginMaxAttempts < 1) {
    logger.warn('LOGIN_MAX_ATTEMPTS tidak valid, dipakai nilai bawaan 5');
    env.security.loginMaxAttempts = 5;
  }

  if (env.security.loginLockoutMinutes < 1) {
    logger.warn('LOGIN_LOCKOUT_MINUTES tidak valid, dipakai nilai bawaan 5');
    env.security.loginLockoutMinutes = 5;
  }
}

module.exports = { env, validateEnv };