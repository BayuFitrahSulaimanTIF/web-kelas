// ===================================================
// AUDIT KEAMANAN SANDI BERJALAN OTOMATIS
//
// Menjalankan brute-force dictionary terhadap hash argon2 milik akun
// sendiri, lalu menulis hasilnya ke security_audit.json supaya bisa
// dibaca di secret ebook. Tujuannya murni DEFENSIF: mencari akun yang
// password-nya bisa ditebak, agar bisa dipaksa reset.
//
// PENTING: ini BUKAN menyimpan password plaintext. Password yang muncul
// di laporan adalah password yang BERHASIL DITEBAK, artinya sudah lemah
// dan bisa dibuka siapa pun. Hash argon2id tidak bisa dibalik.
//
// Audit bersifat INCREMENTAL: hanya akun yang hash-nya berubah (akun
// baru, register ulang, ganti/reset password) yang diuji ulang. Sidik
// jari hash disimpan agar tidak perlu membandingkan hash penuh.
//
// Pemicu: cek berkala + tanda manual dari endpoint auth saat password
// berubah. Satu pekerjaan berjalan paling banyak satu kali (lock), dengan
// jeda antar akun supaya server tetap responsif.
// ===================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { db } = require('../config/database');
const { auditAccount, WORDLIST_VERSION } = require('./securityAudit');

// File hasil disimpan di folder backend/ (bukan utils/) supaya tidak ikut
// ter-serve sebagai aset dan mudah ditemukan dari app.js.
const RESULT_FILE = path.join(__dirname, '..', 'security_audit.json');
const CHECK_INTERVAL_MS = 5 * 60 * 1000;  // cek 5 menit
const FIRST_RUN_DELAY_MS = 20000;         // tunggu startup selesai
const GAP_MS = 300;                       // jeda antar akun
const PER_ACCOUNT_BUDGET_MS = 90 * 1000;  // batas waktu per akun per siklus

let running = false;
let timer = null;

// Sidik jari hash: 16 karakter sha256. Cukup untuk tahu "hash berubah",
// tidak menyimpan hash password itu sendiri.
function fingerprint(hash) {
  return crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 16);
}

function readResult() {
  try {
    const data = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
    if (data && Array.isArray(data.results)) return data;
  } catch (e) {}
  return null;
}

function writeResult(data) {
  fs.writeFileSync(RESULT_FILE, JSON.stringify(data, null, 2));
}

function saveSummary(results) {
  const payload = {
    generatedAt: new Date().toISOString(),
    wordlistVersion: WORDLIST_VERSION,
    note: 'Dicrack offline terhadap hash argon2id. Password yang tampil HANYA yang berhasil ditebak (berarti lemah).',
    summary: {
      total: results.length,
      weak: results.filter((r) => r.cracked).length,
      strong: results.filter((r) => !r.cracked && !r.pending).length,
      pending: results.filter((r) => r.pending).length
    },
    results
  };
  writeResult(payload);
  return payload;
}

// Daftar akun yang perlu diaudit ulang: akun baru, hash berubah, hasil
// sebelumnya belum tuntas, atau versi kandidat naik.
async function planAudit() {
  const [users] = await db.query(
    'SELECT id, username, full_name, email, password_hash FROM users ORDER BY id'
  );
  const last = readResult();
  if (!last || last.wordlistVersion !== WORDLIST_VERSION) return users;
  const byUser = new Map();
  (last.results || []).forEach((r) => byUser.set(r.username, r));
  return users.filter((u) => {
    const prev = byUser.get(u.username);
    if (!prev) return true;
    if (prev.fingerprint !== fingerprint(u.password_hash)) return true;
    return !!prev.pending; // lanjutkan yang belum tuntas
  });
}

async function runAudit() {
  if (running) return { status: 'sudah berjalan' };
  const planned = await planAudit();
  if (!planned.length) {
    const last = readResult();
    return { status: 'tidak ada perubahan', summary: last ? last.summary : null, durationSec: 0 };
  }
  running = true;
  const startedAt = Date.now();
  try {
    const last = readResult();
    const byUser = new Map();
    if (last && last.wordlistVersion === WORDLIST_VERSION) {
      (last.results || []).forEach((r) => byUser.set(r.username, r));
    }
    for (const u of planned) {
      const prev = byUser.get(u.username);
      const r = await auditAccount(u, PER_ACCOUNT_BUDGET_MS, prev ? prev.resumeAt : 0);
      r.fingerprint = fingerprint(u.password_hash);
      byUser.set(u.username, r);
      // Simpan setelah tiap akun: kalau server restart, hasil yang sudah
      // selesai tidak hilang.
      saveSummary(Array.from(byUser.values()));
      await new Promise((res) => setTimeout(res, GAP_MS));
    }
    const results = Array.from(byUser.values()).sort((a, b) => a.username.localeCompare(b.username));
    const payload = saveSummary(results);
    return {
      status: 'selesai',
      audited: planned.length,
      summary: payload.summary,
      durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(1))
    };
  } catch (error) {
    return { status: 'gagal', message: error.message };
  } finally {
    running = false;
  }
}

// Dipanggil dari endpoint auth setiap kali password bisa berubah
// (register, ganti password, reset password). Hasil lama untuk akun itu
// langsung dibuang supaya siklus audit berikutnya mengujinya lagi.
function markAccountDirty(userId, username) {
  try {
    const last = readResult();
    if (!last) return false;
    const before = last.results.length;
    last.results = last.results.filter((r) => r.username !== username);
    if (last.results.length === before) return false;
    last.generatedAt = new Date().toISOString();
    last.summary = {
      total: last.results.length,
      weak: last.results.filter((r) => r.cracked).length,
      strong: last.results.filter((r) => !r.cracked && !r.pending).length,
      pending: last.results.filter((r) => r.pending).length
    };
    writeResult(last);
    return true;
  } catch (e) {
    return false;
  }
}

function startAutoAudit() {
  const tick = async () => {
    try {
      const planned = await planAudit();
      if (planned.length) {
        const r = await runAudit();
        console.log('[audit] ' + r.status + ' diaudit=' + (r.audited || 0) + ' ' + JSON.stringify(r.summary || r.message || ''));
      }
    } catch (e) {
      console.error('[audit] error: ' + e.message);
    }
  };
  setTimeout(tick, FIRST_RUN_DELAY_MS);
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function auditStatus() {
  const last = readResult();
  return {
    running,
    checkIntervalMinutes: CHECK_INTERVAL_MS / 60000,
    wordlistVersion: WORDLIST_VERSION,
    last: last ? { generatedAt: last.generatedAt, summary: last.summary } : null
  };
}

module.exports = { startAutoAudit, runAudit, auditStatus, markAccountDirty, RESULT_FILE };