// ===================================================
// INISIALISASI DATABASE (NON-DESTRUKTIF)
// Menjalankan seluruh isi database/schema.sql secara
// urut (CREATE IF NOT EXISTS + SEED INSERT IGNORE)
// pada database yang dikonfigurasi di .env:
//   node scripts/init-db.js
// AMAN dijalankan berulang kali: tidak ada DROP TABLE,
// data lama (riwayat chat community, komentar, dsb.)
// tetap dipertahankan. Cocok untuk restart/upgrade.
// ===================================================

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2');
const { env } = require('../config/env');

async function main() {
  const file = path.resolve(__dirname, '../../database/schema.sql');
  const sql = fs.readFileSync(file, 'utf8');

  // Buang seluruh baris komentar ('-- ...') TERLEBIH DAHULU.
  // Tanpa ini, bagian yang diawali komentar ikut lenyap
  // karena filter berbasis startsWith('--') memotong
  // sebagian statement.
  const withoutComments = sql.replace(/^\s*--.*$/gm, '');

  const statements = withoutComments
    .split(/;\s*\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s);

  const pool = mysql.createConnection({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.name,
    multipleStatements: false
  });

  for (const statement of statements) {
    await pool.promise().query(statement);
  }
  console.log(`Schema diinisialisasi (${statements.length} statement).`);

  // ============ MIGRASI IDEMPOTEN ============
  // Kolom bio (bio profil) tidak ada pada DB lama.
  const [cols] = await pool.promise().query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'bio'"
  );
  if (cols[0].n === 0) {
    await pool.promise().query('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT NULL');
    console.log('Migrasi: kolom users.bio ditambahkan.');
  } else {
    console.log('Migrasi: kolom users.bio sudah ada.');
  }

  // Kolom avatar (foto profil) tidak ada pada DB lama.
  const [avatarCols] = await pool.promise().query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar'"
  );
  if (avatarCols[0].n === 0) {
    await pool.promise().query('ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL');
    console.log('Migrasi: kolom users.avatar ditambahkan.');
  } else {
    console.log('Migrasi: kolom users.avatar sudah ada.');
  }

  // Kolom nim (daftar anggota mahasiswa di navigasi Students).
  const [nimCols] = await pool.promise().query(
    "SELECT COUNT(*) AS n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'nim'"
  );
  if (nimCols[0].n === 0) {
    await pool.promise().query('ALTER TABLE users ADD COLUMN nim VARCHAR(20) DEFAULT NULL AFTER full_name');
    console.log('Migrasi: kolom users.nim ditambahkan.');
  } else {
    console.log('Migrasi: kolom users.nim sudah ada.');
  }

  // Isi NIM untuk akun demo yang sudah ada (INSERT IGNORE tidak
  // memperbarui baris lama, jadi backfill manual per username).
  await pool.promise().query("UPDATE users SET nim = '230101001' WHERE username = 'student1' AND nim IS NULL");
  await pool.promise().query("UPDATE users SET nim = '230101002' WHERE username = 'student2' AND nim IS NULL");
  await pool.promise().query("UPDATE users SET nim = '230101003' WHERE username = 'student3' AND nim IS NULL");

  // Gender akun demo (belum terisi pada seed lama).
  await pool.promise().query("UPDATE users SET gender = 'male' WHERE username = 'student1' AND gender IS NULL");
  await pool.promise().query("UPDATE users SET gender = 'male' WHERE username = 'student2' AND gender IS NULL");
  await pool.promise().query("UPDATE users SET gender = 'female' WHERE username = 'student3' AND gender IS NULL");

  // Bio akun demo (agar kolom Info dan kartu Students terisi).
  await pool.promise().query("UPDATE users SET bio = 'Mahasiswa aktif semester 4, minat di pengembangan web.' WHERE username = 'student1' AND (bio IS NULL OR bio = '')");
  await pool.promise().query("UPDATE users SET bio = 'Aktif dalam organisasi robotika kampus.' WHERE username = 'student2' AND (bio IS NULL OR bio = '')");
  await pool.promise().query("UPDATE users SET bio = 'Penggemar desain UI/UX dan ilustrasi.' WHERE username = 'student3' AND (bio IS NULL OR bio = '')");

  await pool.promise().end();
}

main().catch((err) => {
  console.error('init-db gagal:', err.message);
  process.exit(1);
});

