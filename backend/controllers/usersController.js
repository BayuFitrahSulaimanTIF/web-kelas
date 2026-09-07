// ===================================================
// CONTROLLER USERS (daftar untuk fitur mention)
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const { db } = require('../config/database');

exports.listMentions = asyncHandler(async (req, res) => {
  const [rows] = await db.query(
    `SELECT id, username, full_name, role
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
            full_name, gender, role, is_active, avatar, bio
     FROM users
     WHERE role IN ('admin', 'mahasiswa', 'student')
     ORDER BY role, full_name ASC`
  );
  res.json({ users: rows });
});
