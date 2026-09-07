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

const USER_COLUMNS = 'id, username, email, full_name, role, managed_course, is_active, failed_login_attempts, locked_until, last_login_at, birth_date, gender, bio, avatar, created_at, updated_at';
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

  async create({ username, email, passwordHash, accountToken, full_name, role, managed_course, birth_date, gender }) {
    const [result] = await db.execute(
      'INSERT INTO users (username, email, password_hash, account_token, role, managed_course, full_name, birth_date, gender) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [username, email, passwordHash, accountToken, role || 'student', managed_course || null, full_name || null, birth_date || null, gender || null]
    );
    return result.insertId;
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

  async updateAvatar(id, avatar) {
    await db.execute(
      'UPDATE users SET avatar = ? WHERE id = ?',
      [avatar, id]
    );
  }
};

module.exports = User;