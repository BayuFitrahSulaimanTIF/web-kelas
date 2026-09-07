// ===================================================
// MIGRASI SKEMA LAMA -> SKEMA ARGON2ID
// Jalankan saat basis data masih memakai password_code
// (kode 15 karakter) / status / tanpa account_token:
//   node scripts/alterUsers.js
//
// CATATAN PENTING: hash password lama (kode deterministik
// 15 karakter) TIDAK bisa diubah kembali menjadi Argon2id
// karena kata sandi asli tidak disimpan. Akun lama diberi
// hash pengganti acak (login akan gagal) sampai user
// memakai alur "Lupa kata sandi"/reset.
// ===================================================

require('dotenv').config();

const crypto = require('crypto');
const { db } = require('../config/database');
const PasswordCodec = require('../utils/passwordCodec');
const { generateAccountToken } = require('../utils/accountToken');

async function columnExists(table, column) {
  const [rows] = await db.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1',
    [table, column]
  );
  return rows.length > 0;
}

async function main() {
  // 1. Kolom baru
  if (!(await columnExists('users', 'password_hash'))) {
    await db.query('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255) NULL AFTER email');
    console.log('+ password_hash');
  }
  if (!(await columnExists('users', 'account_token'))) {
    await db.query('ALTER TABLE users ADD COLUMN account_token CHAR(15) NULL UNIQUE AFTER password_hash');
    console.log('+ account_token');
  }
  if (!(await columnExists('users', 'is_active'))) {
    await db.query('ALTER TABLE users ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER role');
    console.log('+ is_active');
  }

  // 2. Isi account_token acak untuk baris lama
  const [oldRows] = await db.query('SELECT id FROM users WHERE account_token IS NULL OR account_token = \'\'');
  for (const row of oldRows) {
    await db.query('UPDATE users SET account_token = ? WHERE id = ?', [generateAccountToken(), row.id]);
  }
  console.log(`- account_token diisi untuk ${oldRows.length} baris`);

  // 3. Konversi status -> is_active
  const [oldStatus] = await db.query('SELECT id, status FROM users');
  for (const row of oldStatus) {
    const active = row.status !== 'inactive' ? 1 : 0;
    await db.query('UPDATE users SET is_active = ? WHERE id = ?', [active, row.id]);
  }
  console.log(`- status -> is_active untuk ${oldStatus.length} baris`);

  // 4. Password lama: hash pengganti acak (login gagal sampai
  //    user mereset kata sandi via /api/auth/reset-password)
  const [noHash] = await db.query('SELECT id FROM users WHERE password_hash IS NULL OR password_hash = \'\'');
  for (const row of noHash) {
    const placeholder = await PasswordCodec.hashPassword('placeholder-' + crypto.randomUUID());
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [placeholder, row.id]);
  }
  console.log(`- password_hash pengganti untuk ${noHash.length} baris (harus reset kata sandi dulu)`);

  // 5. Hapus kolom lama / sesuaikan tipe
  if (await columnExists('users', 'password_code')) {
    await db.query('ALTER TABLE users DROP COLUMN password_code');
    console.log('+ dropped password_code');
  }
  if (await columnExists('users', 'status')) {
    await db.query('ALTER TABLE users DROP COLUMN status');
    console.log('+ dropped status');
  }

  console.log('Migrasi selesai. Gunakan alur reset kata sandi untuk akun lama.');
  await db.end();
}

main().catch((err) => {
  console.error('Migrasi gagal:', err.message);
  process.exit(1);
});