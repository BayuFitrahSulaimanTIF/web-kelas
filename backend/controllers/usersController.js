// ===================================================
// CONTROLLER USERS (daftar untuk fitur mention)
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const { db } = require('../config/database');
const User = require('../models/User');

// Setelah detik ini tanpa laporan, dianggap offline. Harus lebih besar
// dari interval heartbeat di frontend supaya request yang telat tidak
// salah dinoyatakan offline.
const PRESENCE_OFFLINE_AFTER_S = 45;

exports.listMentions = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, username, full_name, role, avatar
     FROM users
     WHERE is_active = 1
     ORDER BY username ASC
     LIMIT 200`
  );
  res.json({ users: rows });
});

exports.listStudents = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, username,
            COALESCE(NULLIF(nim, ''), CASE WHEN username REGEXP '^[0-9]+$' THEN username END) AS nim,
            full_name, gender, role, is_active, avatar, bio, last_seen_at,
            -- presence hanya untuk tampilan; is_active tetap ermisi login.
            CASE
              WHEN last_seen_at IS NULL THEN 'offline'
              WHEN last_seen_at < DATE_SUB(NOW(), INTERVAL ? SECOND) THEN 'offline'
              ELSE 'online'
            END AS presence
     FROM users
     WHERE role IN ('admin', 'mahasiswa', 'student')
     ORDER BY role, full_name ASC`,
    [PRESENCE_OFFLINE_AFTER_S]
  );
  res.json({ users: rows });
});

// Melaporkan bahwa pengguna masih membuka Web Kelas.
exports.touchPresence = asyncHandler(async (req, res) => {
  await User.touchPresence(req.user.id);
  res.json({ ok: true });
});
