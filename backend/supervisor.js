// ===================================================
// SUPERVISOR — satu-satunya penjaga server + ngrok
//
// Menggantikan watchdog.js + watchdog.ps1 yang tadinya
// dobel (PowerShell + Node) dan saling spawn -> kubang proses.
//
// Tanggung jawab:
//   1. Pastikan `node server.js` hidup (cek /api/health localhost)
//   2. Pastikan `ngrok http 3000` hidup (cek proses ngrok.exe)
//   3. TIDAK pernah menypawn dirinya sendiri
//
// Jalankan hidden:  node supervisor.js
// Otomatis saat boot lewat registry: WebKelas
// ===================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const DIR = __dirname;
const LOG = path.join(DIR, 'supervisor.log');
const PID_FILE = path.join(DIR, '.supervisor.pid');
const LOG_MAX = 1024 * 1024;
const CHECK_MS = 5000;
let ngrokPid = 0;

function log(msg) {
  try {
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > LOG_MAX) fs.truncateSync(LOG, 0);
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {}
}

// ---------- singleton: jangan jalan dua supervisor ----------
let running = false;
try {
  if (fs.existsSync(PID_FILE)) {
    const old = Number(fs.readFileSync(PID_FILE, 'utf8').trim());
    if (old && old !== process.pid) {
      let alive = false;
      try { process.kill(old, 0); alive = true; } catch (e) {}
      if (alive) {
        console.log('[supervisor] sudah jalan PID ' + old + ' — keluar');
        process.exit(0);
      }
    }
  }
  fs.writeFileSync(PID_FILE, String(process.pid));
  running = true;
} catch (e) {
  log('pidfile gagal: ' + e.message);
}

// ---------- cek server ----------
function isServerUp() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { try { req.destroy(); } catch (e) {} resolve(false); });
  });
}

// ---------- cek ngrok lewat API lokal agent ----------
// Penting: cek tunnel yang benar-benar hidup, bukan cuma ada prosesnya.
//dashed Kalau cuma `tasklist`, proses ngrok yang menggantung dianggap hidup
// sehingga tunnel baru terus ditambahkan -> ERR_NGROK_6030 (banyak endpoint
// di satu domain tanpa pooling).
function ngrokTunnels() {
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:4040/api/tunnels', (res) => {
      let body = '';
      res.on('data', (c) => { body += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(body).tunnels || []); } catch (e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(2500, () => { try { req.destroy(); } catch (e) {} resolve([]); });
  });
}

function ngrokPids() {
  const pids = [];
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq ngrok.exe" /FO CSV /NH', {
      stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000
    }).toString();
    for (const line of out.split(/\r?\n/)) {
      const m = line.match(/"([^"]*)",\s*"(\d+)"/);
      if (m) pids.push(Number(m[2]));
    }
  } catch (e) {}
  return pids;
}

// Bunuh ngrok.exe yang bukan milik kita (manual user, sisa tunnel lama).
function killStrayNgrok() {
  for (const pid of ngrokPids()) {
    if (pid === ngrokPid) continue;
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 4000 });
      log('bunuh ngrok liar pid=' + pid);
    } catch (e) {}
  }
}

function findNgrok() {
  const candidates = [
    'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\ngrok\\bin\\ngrok.exe',
    path.join(DIR, 'node_modules', '.bin', 'ngrok.cmd'),
    'ngrok'
  ];
  for (const p of candidates) {
    try { if (p === 'ngrok' || fs.existsSync(p)) return p; } catch (e) {}
  }
  return 'ngrok';
}

// ---------- start proses child secara hidden ----------
function startServer() {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: DIR, detached: true, stdio: 'ignore', windowsHide: true
  });
  child.unref();
  log('server.js start pid=' + child.pid);
}

function startNgrok() {
  killStrayNgrok();
  const child = spawn(findNgrok(), ['http', '3000'], {
    cwd: DIR, detached: true, stdio: 'ignore', windowsHide: true
  });
  child.unref();
  ngrokPid = child.pid;
  log('ngrok start pid=' + child.pid);
}

// ---------- loop utama ----------
async function tick() {
  if (!running) return;
  try {
    if (await isServerUp()) {
      const tunnels = await ngrokTunnels();
      if (!tunnels.length) {
        // tunnel hidup? tidak -> ARCHIPELAGUS tersendat
        startNgrok();
      } else {
        // tunnel ada tapi proses ngrok proliferasi -> rapikan jadi satu
        const pids = ngrokPids();
        if (pids.length > 1) killStrayNgrok();
      }
    } else {
      // port 3000 masih dipegang proses mati? diamkan lalu start
      try {
        const out = execSync('netstat -ano | findstr :3000', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString();
        const m = out.match(/:3000[^\n]*LISTENING\s+(\d+)/i);
        if (m) { try { execSync(`taskkill /F /PID ${m[1]}`, { stdio: 'ignore', timeout: 3000 }); } catch (e) {} }
      } catch (e) {}
      startServer();
      // tunggu server siap sebelum/lama-lama cek tunnel
      await new Promise((r) => setTimeout(r, 3000));
      if (!(await ngrokTunnels()).length) startNgrok();
    }
  } catch (e) {
    log('tick err: ' + (e.message || e));
  }
}

function cleanup() {
  try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {}
  log('supervisor stop');
  process.exit(0);
}
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('exit', () => { try { if (fs.existsSync(PID_FILE)) fs.unlinkSync(PID_FILE); } catch (e) {} });

log('supervisor start pid=' + process.pid);
tick();
setInterval(tick, CHECK_MS);
