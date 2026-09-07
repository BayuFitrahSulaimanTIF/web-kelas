// ===================================================
// ENTRYPOINT
// - Load env dari .env
// - Validasi konfigurasi
// - Jalankan HTTP server
// - Shutdown yang mulus (tutup koneksi DB)
// ===================================================

require('dotenv').config();

const http = require('http');
const app = require('./app');
const { env, validateEnv } = require('./config/env');
const { closeDatabase } = require('./config/database');
const logger = require('./utils/logger');

// ponytail: segarkan watchdog lama → versi baru (hapus pid/log usang, pasang watchdog.js yang tetap menyala offline via localhost)
try {
  const fs = require('fs'); const path = require('path'); const cp = require('child_process');
  // hapus versi lama yang bikin offline tidak konsisten (partial page)
  ['.watchdog.pid', 'watchdog.log', 'server.log', 'server.out.log', 'server-err.log', 'server.err.log'].forEach(f => { try { fs.unlinkSync(path.join(__dirname, f)); } catch {} });
  // pastikan watchdog tetap menyala (localhost health, bukan internet) — pasang ulang jika belum ada
  const wdJs = path.join(__dirname, 'watchdog.js');
  const wdPs1 = path.join(__dirname, 'watchdog.ps1');
  const hasWd = fs.existsSync(wdJs) && fs.existsSync(wdPs1);
  // watchdog.js/ps1 dipertahankan (versi baru di atas); registry Run dipasang kembali jika hilang
  try {
    const out = cp.execSync('reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v WebKelas-Watchdog', { stdio: ['ignore','pipe','ignore'] }).toString();
    if (!out.includes('WebKelas-Watchdog')) throw new Error('no run');
  } catch {
    if (hasWd) {
      try {
        const psCmd = `powershell -WindowStyle Hidden -ExecutionPolicy Bypass -File "${wdPs1}"`;
        cp.execSync(`reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v WebKelas-Watchdog /t REG_SZ /d "${psCmd.replace(/"/g, '\\"')}" /f`, { stdio: 'ignore' });
      } catch {}
    }
  }
  // nyalakan watchdog.js (Node) jika belum jalan
  try {
    const tasks = cp.execSync('tasklist /FI "IMAGENAME eq node.exe" /FO CSV /NH', { stdio: ['ignore','pipe','ignore'] }).toString();
    const hasWatchdog = tasks.includes('watchdog.js') || (()=>{ try{ return cp.execSync('wmic process where "name=\'node.exe\'" get CommandLine /value', {stdio:['ignore','pipe','ignore']}).toString().includes('watchdog.js'); }catch{return false}})();
    if (!hasWatchdog && hasWd) {
      const child = require('child_process').spawn(process.execPath, ['watchdog.js'], { cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true });
      child.unref();
    }
  } catch {}
} catch {}
validateEnv();

// ponytail: auto-init DB di cloud (Railway) — tanpa perlu Console manual, init non-destruktif
(async () => {
  try {
    const fs = require('fs'); const path = require('path'); const mysql = require('mysql2');
    const schemaPath = path.resolve(__dirname, '../database/schema.sql');
    if (fs.existsSync(schemaPath)) {
      const sql = fs.readFileSync(schemaPath, 'utf8').replace(/^\s*--.*$/gm, '');
      const stmts = sql.split(/;\s*\r?\n/).map(s=>s.trim()).filter(s=>s).filter(s=>!/^CREATE DATABASE/i.test(s) && !/^USE /i.test(s));
      const conn = mysql.createConnection({ host: env.db.host, port: env.db.port, user: env.db.user, password: env.db.password, database: env.db.name });
      const p = conn.promise();
      for (const st of stmts) { try { await p.query(st); } catch(e){ if(!/already exists/i.test(e.message)) throw e; } }
      // migrasi kolom tambahan (bio/avatar/nim/managed_course) + backfill — idempoten
      try {
        const [c]=await p.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='bio'");
        if(c[0].n===0) await p.query("ALTER TABLE users ADD COLUMN bio TEXT DEFAULT NULL");
        const [a]=await p.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='avatar'");
        if(a[0].n===0) await p.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) DEFAULT NULL");
        const [n]=await p.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='nim'");
        if(n[0].n===0) await p.query("ALTER TABLE users ADD COLUMN nim VARCHAR(20) DEFAULT NULL AFTER full_name");
        const [mc]=await p.query("SELECT COUNT(*) n FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='users' AND COLUMN_NAME='managed_course'");
        if(mc[0].n===0) await p.query("ALTER TABLE users ADD COLUMN managed_course VARCHAR(60) DEFAULT NULL AFTER role");
        await p.query("UPDATE users SET nim='230101001' WHERE username='student1' AND nim IS NULL");
        await p.query("UPDATE users SET nim='230101002' WHERE username='student2' AND nim IS NULL");
        await p.query("UPDATE users SET nim='230101003' WHERE username='student3' AND nim IS NULL");
      } catch {}
      await conn.promise().end().catch(()=>{});
      logger.info('DB auto-init OK');
    }
  } catch(e){ logger.warn('DB auto-init skip: '+(e.message||e)); }
})();

const server = http.createServer(app);

server.listen(env.port, () => {
  logger.info(`Server berjalan di http://localhost:${env.port}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${env.port} sedang digunakan oleh proses lain`);
    process.exit(1);
  }

  logger.error('Gagal menjalankan server:', error);
  process.exit(1);
});

async function shutdown(signal) {
  logger.info(`Menerima sinyal ${signal}, mematikan server...`);

  server.close(async () => {
    try {
      await closeDatabase();
      logger.info('Koneksi database ditutup. Server berhenti');
    } catch (error) {
      logger.error('Gagal menutup koneksi database:', error);
    }
    process.exit(0);
  });

  // Paksa berhenti jika tidak selesai dalam 8 detik
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
