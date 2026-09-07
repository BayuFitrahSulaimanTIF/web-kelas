// ===================================================
// MODEL FILE NOTIFICATIONS (pemberitahuan mention)
// ===================================================

const { db } = require('../config/database');

const FileNotification = {
  async create({ userId, senderId, commentId, fileKind, fileId, fileName, content }) {
    const [result] = await db.query(
      `INSERT INTO file_notifications
         (user_id, sender_id, comment_id, file_kind, file_id, file_name, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, senderId, commentId, fileKind, fileId, fileName, content]
    );
    return result.insertId;
  },

  async listByUser(userId, unreadOnly) {
    const [rows] = await db.query(
      `SELECT n.id, n.user_id, n.sender_id, n.comment_id, n.file_kind, n.file_id,
              n.file_name, n.content, n.is_read, n.created_at,
              u.username, u.full_name, u.role
       FROM file_notifications n
       JOIN users u ON u.id = n.sender_id
       WHERE n.user_id = ? ${unreadOnly ? 'AND n.is_read = 0' : ''}
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT 50`,
      [userId]
    );
    return rows;
  },

  async markRead(id, userId) {
    await db.query(
      'UPDATE file_notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [id, userId]
    );
  },

  async markAllRead(userId) {
    await db.query(
      'UPDATE file_notifications SET is_read = 1 WHERE user_id = ?',
      [userId]
    );
  }
};

module.exports = FileNotification;
