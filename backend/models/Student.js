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
  }
};

module.exports = Student;
