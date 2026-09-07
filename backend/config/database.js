// ===================================================
// POOL KONEKSI DATABASE
// ===================================================

const mysql = require('mysql2');
const { env } = require('./env');

// Keamanan berlapis (L2 - parameterized / prepared statement):
// 1. multipleStatements: false -> stacked query ('; DROP TABLE ...; --)
//    ditolak protokol MySQL, bukan oleh filter input.
// 2. Seluruh query memakai placeholder '?' (client-side escaping)
//    di config/database ini; jalur kredensial (login/refresh) memakai
//    db.execute() = server-side prepared statement (COM_STMT_PREPARE).
// 3. Tidak ada blacklist kata (OR/UNION/--); input selalu data, bukan SQL.

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.name,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: 'local',
  multipleStatements: false,
  charset: 'utf8mb4'
});

const db = pool.promise();

async function pingDatabase() {
  const [rows] = await db.query('SELECT 1 AS ok');
  return rows[0].ok === 1;
}

async function closeDatabase() {
  await pool.end();
}

module.exports = { db, pingDatabase, closeDatabase };
