// ===================================================
// MODEL USER
// password_hash : hash Argon2id (jarang diambil; hanya
//                 untuk verifikasi login/SSO)
// account_token : 15 karakter acak (identifier internal)
// is_active     : boolean menggantikan status
// ===================================================
// SEMUA query memakai parameter placeholder '?' (bukan
// interpolasi). Jalur kredensial memakai db.execute() =
// prepared statement server-side MySQL (COM_STMT_PREPARE).
// Kata sandi TIDAK pernah masuk ke SQL (hanya hash yang
// diverifikasi Argon2id di utils/passwordCodec.js).

const { db } = require('../config/database');

const USER_COLUMNS = 'id, username, email, full_name, google_id, nim, role, managed_course, is_active, last_seen_at, failed_login_attempts, locked_until, last_login_at, birth_date, gender, bio, avatar, created_at, updated_at';
// Kolom keamanan hanya diambil di jalur yang membutuhkannya
const AUTH_COLUMNS = `${USER_COLUMNS}, password_hash`;

const User = {
  async findById(id) {
    const [rows] = await db.execute(
      `SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByUsername(username) {
    const [rows] = await db.execute(
      `SELECT ${AUTH_COLUMNS} FROM users WHERE username = ? LIMIT 1`,
      [username]
    );
    return rows[0] || null;
  },

  async findByEmail(email) {
    const [rows] = await db.execute(
      `SELECT ${AUTH_COLUMNS} FROM users WHERE email = ? LIMIT 1`,
      [email]
    );
    return rows[0] || null;
  },

  async findByUsernameOrEmail(value) {
    const [rows] = await db.execute(
      `SELECT ${AUTH_COLUMNS} FROM users WHERE username = ? OR email = ? LIMIT 1`,
      [value, value]
    );
    return rows[0] || null;
  },

  // Akun Web Kelas juga dicari lewat NIM: alamat email di akun Google bisa
  // berbeda tulisannya, sedangkan NIM-nya sama. Pakai ini supaya login
  // Google tidak membuat akun kembar dan role yang sudah ada ikut terbawa.
  async findByNim(nim) {
    const [rows] = await db.execute(
      `SELECT ${USER_COLUMNS} FROM users WHERE nim = ? LIMIT 1`,
      [nim]
    );
    return rows[0] || null;
  },

  async create({ username, email, passwordHash, accountToken, full_name, role, managed_course, birth_date, gender, google_id }) {
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, account_token, role, managed_course, full_name, birth_date, gender, google_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash || null, accountToken, role || 'student', managed_course || null, full_name || null, birth_date || null, gender || null, google_id || null]
    );
    return result.insertId;
  },

  // Akun yang masuk lewat Google dicari lewat sub-nya supaya tetap dikenali
  // walaupun dia mengganti email di akun Google.
  async findByGoogleId(googleId) {
    const [rows] = await db.execute(
      `SELECT ${USER_COLUMNS} FROM users WHERE google_id = ? LIMIT 1`,
      [googleId]
    );
    return rows[0] || null;
  },

  async linkGoogleId(id, googleId) {
    await db.execute(
      'UPDATE users SET google_id = ? WHERE id = ?',
      [googleId, id]
    );
  },

  // Foto profil dari Google disimpan lewat kolom avatar yang sudah ada,
  // supaya semua tampilan (aside, kartu akun, mention) ikut memakainya.
  async updateAvatar(id, avatar) {
    await db.execute(
      'UPDATE users SET avatar = ? WHERE id = ?',
      [avatar, id]
    );
  },

  async isUsernameTaken(username) {
    const [rows] = await db.execute(
      'SELECT 1 FROM users WHERE username = ? LIMIT 1',
      [username]
    );
    return rows.length > 0;
  },

  async updateNim(id, nim) {
    await db.execute(
      'UPDATE users SET nim = ? WHERE id = ?',
      [nim || null, id]
    );
  },

  // Hashing dilakukan di utils/passwordCodec.js (Argon2id);
  // model hanya menyimpan hasil hash.
  async updatePassword(id, passwordHash) {
    await db.execute(
      'UPDATE users SET password_hash = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      [passwordHash, id]
    );
  },

  async activateByUsername(username) {
    await db.execute(
      'UPDATE users SET is_active = 1 WHERE username = ?',
      [username]
    );
  },

  // Kehadiran di aplikasi. Sengaja TIDAK menyentuh is_active: kolom itu
  // milik admin (menonaktifkan akun) dan dipakai untuk memblokir login.
  // Tanpa laporan selama PRESCENCE_TIMEOUT_S detik, dianggap offline.
  async touchPresence(id) {
    await db.execute(
      'UPDATE users SET last_seen_at = NOW() WHERE id = ?',
      [id]
    );
  },

  async recordLoginSuccess(id) {
    await db.execute(
      'UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = ?',
      [id]
    );
  },

  async recordLoginFailure(id) {
    await db.execute(
      'UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?',
      [id]
    );
  },

  // INTERVAL ? MINUTE tidak dapat diprepare -> tetap parameter
  // placeholder '?' (client-side escaping, setara anti-injeksi)
  async lockAccount(id, lockoutMinutes) {
    await db.query(
      'UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE), failed_login_attempts = 0 WHERE id = ?',
      [lockoutMinutes, id]
    );
  },

  async clearLock(id) {
    await db.execute(
      'UPDATE users SET locked_until = NULL, failed_login_attempts = 0 WHERE id = ?',
      [id]
    );
  },

  async updateBio(id, bio) {
    await db.execute(
      'UPDATE users SET bio = ? WHERE id = ?',
      [bio, id]
    );
  },

  // Untuk pemberitahuan massal (mis. berita News baru).
  async listAllExcept(userId) {
    const [rows] = await db.query(
      'SELECT id, username, full_name FROM users WHERE id <> ?',
      [userId]
    );
    return rows;
  }
};

module.exports = User;