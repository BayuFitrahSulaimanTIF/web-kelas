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

// ponytail: tidak ada lagi auto-install watchdog di dalam server —
// satu penjaga saja (supervisor.js) yang menyalakan server + ngrok.
// Dulu server.js men-spawn watchdog.js yang men-spawn server.js lagi (kubang proses).
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
