// ===================================================
// MODEL REFRESH TOKEN
// Hanya HASH SHA-256 token yang disimpan di database.
// Rotasi: token lama dihapus saat dipakai untuk refresh.
// ===================================================

const { db } = require('../config/database');

const RefreshToken = {
  async create({ userId, tokenHash, expiresAt }) {
    const [result] = await db.execute(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );
    return result.insertId;
  },

  async findByHash(tokenHash) {
    const [rows] = await db.execute(
      'SELECT * FROM refresh_tokens WHERE token_hash = ? LIMIT 1',
      [tokenHash]
    );
    return rows[0] || null;
  },

  async deleteById(id) {
    await db.execute('DELETE FROM refresh_tokens WHERE id = ?', [id]);
  },

  async deleteByUserId(userId) {
    await db.execute('DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
  },

  async deleteExpired() {
    const [result] = await db.query(
      'DELETE FROM refresh_tokens WHERE expires_at < NOW()'
    );
    return result.affectedRows;
  }
};

module.exports = RefreshToken;
