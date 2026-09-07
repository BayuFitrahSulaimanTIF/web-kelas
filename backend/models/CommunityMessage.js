// ===================================================
// MODEL COMMUNITY MESSAGES (chat ala WhatsApp)
// ===================================================

const { db } = require('../config/database');

const BASE_SELECT = `
  SELECT m.id, m.user_id, m.type, m.content, m.filename, m.original_name,
         m.mime_type, m.size, m.reply_to, m.library_ref, m.created_at,
         u.username, u.full_name, u.role,
         r.type AS reply_type, r.content AS reply_content,
         r.filename AS reply_filename, r.original_name AS reply_original_name,
         r.library_ref AS reply_library_ref,
         ru.username AS reply_username, ru.full_name AS reply_full_name,
         (SELECT GROUP_CONCAT(u2.username ORDER BY cr.read_at ASC SEPARATOR ',')
            FROM community_reads cr
            JOIN users u2 ON u2.id = cr.user_id
           WHERE cr.message_id = m.id AND cr.user_id <> m.user_id) AS read_by
  FROM community_messages m
  JOIN users u ON u.id = m.user_id
  LEFT JOIN community_messages r ON r.id = m.reply_to
  LEFT JOIN users ru ON ru.id = r.user_id
`;

const CommunityMessage = {
  async create({ userId, type, content, filename, originalName, mimeType, size, replyTo, libraryRef }) {
    const [result] = await db.query(
      `INSERT INTO community_messages
         (user_id, type, content, filename, original_name, mime_type, size, reply_to, library_ref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, type, content || null, filename || null, originalName || null, mimeType || null, size || 0, replyTo || null, libraryRef || null]
    );
    return result.insertId;
  },

  async findById(id) {
    const [rows] = await db.query(BASE_SELECT + ' WHERE m.id = ?', [id]);
    return rows[0] || null;
  },

  async deleteById(id) {
    const [result] = await db.query('DELETE FROM community_messages WHERE id = ?', [id]);
    return result.affectedRows > 0;
  },

  // Catat id pesan yang dihapus "untuk semua" agar klien lain ikut menghapusnya
  async markDeleted(id) {
    await db.query('INSERT IGNORE INTO community_deleted (id) VALUES (?)', [id]);
  },

  // Id pesan yang dihapus untuk semua (7 hari terakhir), untuk sinkron klien
  async listDeletedIds() {
    const [rows] = await db.query(
      'SELECT id FROM community_deleted WHERE deleted_at > (NOW() - INTERVAL 7 DAY) ORDER BY id ASC'
    );
    return rows.map((r) => r.id);
  },

  // Tandai pesan-pesan yang sudah dilihat oleh pengguna (kecuali pesan miliknya sendiri)
  async markRead({ messageIds, userId }) {
    const ids = (messageIds || []).filter((i) => Number.isInteger(i) && i > 0);
    if (ids.length === 0 || !userId) return;
    const placeholders = ids.map(() => '?').join(',');
    await db.query(
      `INSERT IGNORE INTO community_reads (message_id, user_id)
         SELECT id, ? FROM community_messages
          WHERE id IN (${placeholders}) AND user_id <> ?`,
      [userId, ...ids, userId]
    );
  },

  // Pesan lama (paginate ke atas): id < beforeId, ambil `limit` pesan, terbaru dulu
  async listBefore({ beforeId, limit }) {
    const [rows] = await db.query(
      BASE_SELECT + ' WHERE m.id < ? ORDER BY m.id DESC LIMIT ?',
      [beforeId, limit]
    );
    return rows.reverse();
  },

  // Pesan terbaru di awal (saat pertama dibuka)
  async listLatest({ limit, afterId }) {
    let rows;
    if (afterId) {
      [rows] = await db.query(
        BASE_SELECT + ' WHERE m.id > ? ORDER BY m.id ASC LIMIT ?',
        [afterId, limit]
      );
    } else {
      [rows] = await db.query(
        BASE_SELECT + ' ORDER BY m.id DESC LIMIT ?',
        [limit]
      );
      rows = rows.reverse();
    }
    return rows;
  }
};

module.exports = CommunityMessage;