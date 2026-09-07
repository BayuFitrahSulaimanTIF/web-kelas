// ===================================================
// MODEL FILE COMMENTS (command/diskusi per file)
// ===================================================

const { db } = require('../config/database');

const FileComment = {
  async create({ fileKind, fileId, userId, content, parentId }) {
    const [result] = await db.query(
      `INSERT INTO file_comments (file_kind, file_id, user_id, content, parent_id)
       VALUES (?, ?, ?, ?, ?)`,
      [fileKind, fileId, userId, content, parentId || null]
    );
    return result.insertId;
  },

  async listByFile(fileKind, fileId) {
    const [rows] = await db.query(
      `SELECT c.id, c.file_kind, c.file_id, c.user_id, c.content, c.parent_id, c.created_at,
              u.username, u.full_name, u.role
       FROM file_comments c
       JOIN users u ON u.id = c.user_id
       WHERE c.file_kind = ? AND c.file_id = ?
       ORDER BY c.created_at ASC, c.id ASC`,
      [fileKind, fileId]
    );
    return rows;
  }
};

module.exports = FileComment;
