// ===================================================
// MODEL FILE KELAS (materi & project)
// materials: dokumen materi kelas, khusus admin
// projects : kumpulan kode/tugas project, semua role
// ===================================================

const { db } = require('../config/database');

const TABLES = {
  materi: 'materials',
  project: 'projects',
  tugas: 'tugas',
  uts: 'uts',
  uas: 'uas'
};

const ClassFile = {
  async create(kind, { kelas, filename, originalName, mimeType, size, description, uploadedBy }) {
    const [result] = await db.query(
      `INSERT INTO ${TABLES[kind]} (kelas, filename, original_name, mime_type, size, description, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [kelas, filename, originalName, mimeType, size, description || null, uploadedBy]
    );
    return result.insertId;
  },

  async findById(kind, id) {
    const [rows] = await db.query(
      `SELECT * FROM ${TABLES[kind]} WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },

  async listByKelas(kind, kelas) {
    const [rows] = await db.query(
      `SELECT f.id, f.kelas, f.filename, f.original_name, f.mime_type, f.size, f.description,
              f.uploaded_by, f.created_at, u.username AS uploader_username, u.full_name AS uploader_name
       FROM ${TABLES[kind]} f
       JOIN users u ON u.id = f.uploaded_by
       WHERE f.kelas = ?
       ORDER BY f.created_at DESC, f.id DESC`,
      [kelas]
    );
    return rows;
  },

  async listByKelasAndUser(kind, kelas, userId) {
    const [rows] = await db.query(
      `SELECT f.id, f.kelas, f.filename, f.original_name, f.mime_type, f.size, f.description,
              f.uploaded_by, f.created_at, u.username AS uploader_username, u.full_name AS uploader_name
       FROM ${TABLES[kind]} f
       JOIN users u ON u.id = f.uploaded_by
       WHERE f.kelas = ? AND f.uploaded_by = ?
       ORDER BY f.created_at DESC, f.id DESC`,
      [kelas, userId]
    );
    return rows;
  },

  async deleteById(kind, id) {
    const [result] = await db.query(
      `DELETE FROM ${TABLES[kind]} WHERE id = ?`,
      [id]
    );
    return result.affectedRows > 0;
  },

  async sumSizeByKelas(kind, kelas) {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(size), 0) AS total FROM ${TABLES[kind]} WHERE kelas = ?`,
      [kelas]
    );
    return Number(rows[0].total);
  },

  async sumSizeByKelasAndUser(kind, kelas, userId) {
    const [rows] = await db.query(
      `SELECT COALESCE(SUM(size), 0) AS total FROM ${TABLES[kind]} WHERE kelas = ? AND uploaded_by = ?`,
      [kelas, userId]
    );
    return Number(rows[0].total);
  }
};

module.exports = ClassFile;
