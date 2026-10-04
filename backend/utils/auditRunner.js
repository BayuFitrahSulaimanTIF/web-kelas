// ===================================================
// AUDIT KEAMANAN SANDI BERJALAN OTOMATIS
//
// Menjalankan brute-force dictionary terhadap hash argon2 milik akun
// sendiri, lalu menulis hasilnya ke security_audit.json supaya bisa
// dibaca di secret ebook. Tujuannya murni DEFENSIF: mencari akun yang
// password-nya bisa ditebak, agar bisa dipaksa reset.
//
// Catatan penting: ini BUKAN menyimpan password plaintext. Password yang
// muncul di laporan adalah password yang BERHASIL DITEBAK (artinya sudah
// lemah dan bisa dibuka siapa pun). Hash argon2id tidak bisa dibalik.
//
// Pemicu: interval berkala + endpoint manual. Satu pekerjaan berjalan
// paling banyak satu kali (lock), bergantian dengan jeda supaya server
// tetap responsif.
// ===================================================

const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');
const { auditAccount } = require('./securityAudit');

// File hasil disimpan di folder backend/ (bukan utils/) supaya tidak ikut
// ter-serve sebagai aset dan mudah ditemukan dari app.js.
const RESULT_FILE = path.join(__dirname, '..', 'security_audit.json');
const AUTO_INTERVAL_MS = 30 * 60 * 1000; // 30 menit
const GAP_MS = 250;                       // jeda antar akun
const WORDLIST_VERSION = 1;              // naikkan kalau kandidat berubah

let running = false;
let timer = null;
let lastDoneAt = 0;

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

// Otomatis jalan hanya kalau ada akun yang belum pernah diaudit pada versi
// kandidat saat ini. Kalau semua sudah audited, tidak ada beban sama sekali.
async function needsRun() {
  const last = readResult();
  if (!last || last.wordlistVersion !== WORDLIST_VERSION) return true;
  const [rows] = await db.query('SELECT COUNT(*) c FROM users');
  return rows[0].c !== (last.results || []).length;
}

async function runAudit() {
  if (running) return { status: 'sudah berjalan' };
  running = true;
  const startedAt = Date.now();
  try {
    const [users] = await db.query(
      'SELECT id, username, full_name, email, password_hash FROM users ORDER BY id'
    );
    const results = [];
    for (const u of users) {
      results.push(await auditAccount(u));
      await new Promise((r) => setTimeout(r, GAP_MS));
    }
    const payload = {
      generatedAt: new Date().toISOString(),
      wordlistVersion: WORDLIST_VERSION,
      durationSec: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      note: 'Dicrack offline terhadap hash argon2id. Password yang tampil HANYA yang berhasil ditebak (berarti lemah).',
      summary: {
        total: results.length,
        weak: results.filter((r) => r.cracked).length,
        strong: results.filter((r) => !r.cracked).length
      },
      results
    };
    writeResult(payload);
    lastDoneAt = Date.now();
    return { status: 'selesai', summary: payload.summary, durationSec: payload.durationSec };
  } catch (error) {
    return { status: 'gagal', message: error.message };
  } finally {
    running = false;
  }
}

function startAutoAudit() {
  const tick = async () => {
    try {
      if (await needsRun()) {
        const r = await runAudit();
        console.log('[audit] ' + r.status + ' ' + JSON.stringify(r.summary || r.message || ''));
      }
    } catch (e) {
      console.error('[audit] error: ' + e.message);
    }
  };
  // tunggu 30 detik setelah boot supaya tidak berebut dengan halaman startup
  setTimeout(tick, 30000);
  timer = setInterval(tick, AUTO_INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function auditStatus() {
  const last = readResult();
  return {
    running,
    intervalMinutes: AUTO_INTERVAL_MS / 60000,
    wordlistVersion: WORDLIST_VERSION,
    last: last ? { generatedAt: last.generatedAt, summary: last.summary } : null
  };
}

module.exports = { startAutoAudit, runAudit, auditStatus, RESULT_FILE };