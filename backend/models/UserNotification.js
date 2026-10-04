// ===================================================
// MODEL USER NOTIFICATIONS (lonceng di navbar)
//
// Dipakai untuk: berita News baru dan mention "@username" di Community.
// Tabel dibuat otomatis saat server start supaya tidak perlu langkah
// migrasi manual. Dipisah dari `file_notifications` (mention pada file)
// karena tabel itu terikat foreign key ke file_comments.
// ===================================================

const { db } = require('../config/database');

const TABLE = 'user_notifications';

const UserNotification = {
  async ensureTable() {
    await db.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
         id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
         user_id INT NOT NULL,
         kind VARCHAR(20) NOT NULL,
         title VARCHAR(200) NOT NULL DEFAULT '',
         body TEXT NOT NULL,
         sender_id INT NULL,
         is_read TINYINT(1) NOT NULL DEFAULT 0,
         created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         KEY idx_un_user_read (user_id, is_read),
         CONSTRAINT un_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
       )`
    );
  },

  // Satu INSERT untuk banyak user (mis. berita baru untuk semua user).
  async createMany(items) {
    const rows = (items || []).filter((i) => i && i.userId);
    if (!rows.length) return 0;
    const values = [];
    const placeholders = rows.map((i) => {
      values.push(i.userId, i.kind || 'news', i.title || '', i.body || '', i.senderId || null);
      return '(?, ?, ?, ?, ?)';
    });
    await db.query(
      `INSERT INTO ${TABLE} (user_id, kind, title, body, sender_id) VALUES ${placeholders.join(', ')}`,
      values
    );
    return rows.length;
  },

  async listByUser(userId, unreadOnly) {
    const [rows] = await db.query(
      `SELECT id, kind, title, body, is_read, created_at
         FROM ${TABLE}
        WHERE user_id = ? ${unreadOnly ? 'AND is_read = 0' : ''}
        ORDER BY created_at DESC, id DESC
        LIMIT 50`,
      [userId]
    );
    return rows;
  },

  async markRead(id, userId) {
    await db.query(`UPDATE ${TABLE} SET is_read = 1 WHERE id = ? AND user_id = ?`, [id, userId]);
  },

  async markAllRead(userId) {
    await db.query(`UPDATE ${TABLE} SET is_read = 1 WHERE user_id = ?`, [userId]);
  }
};

module.exports = UserNotification;