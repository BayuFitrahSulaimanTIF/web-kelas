// ===================================================
// MODEL STUDENT (sumber data SSO kampus)
// sso_password_hash: hash Argon2id kata sandi portal
// ===================================================

const { db } = require('../config/database');

const Student = {
  async findByNim(nim) {
    const [rows] = await db.query(
      'SELECT * FROM students WHERE nim = ? LIMIT 1',
      [nim]
    );
    return rows[0] || null;
  },

  async findByEmail(email) {
    const [rows] = await db.query(
      'SELECT * FROM students WHERE email = ? LIMIT 1',
      [email]
    );
    return rows[0] || null;
  },

  async findAllActive() {
    const [rows] = await db.query(
      'SELECT nim, full_name, email, program_studi, angkatan FROM students WHERE status = ? ORDER BY nim ASC',
      ['active']
    );
    return rows;
  },

  // Catat mahasiswa yang ditemukan lewat login Google. Kalau NIM-nya sudah
  // ada di tabel students, datanya tidak ditimpa.
  async upsertFromNim({ nim, fullName, email, angkatan, programStudi, ssoPasswordHash }) {
    const [existing] = await db.query(
      'SELECT nim FROM students WHERE nim = ? LIMIT 1',
      [nim]
    );

    if (existing.length) return false;

    await db.query(
      `INSERT INTO students (nim, full_name, email, program_studi, angkatan, status, sso_password_hash)
       VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      [nim, fullName, email, programStudi, angkatan || null, ssoPasswordHash]
    );

    return true;
  }
};

module.exports = Student;
