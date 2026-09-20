// tunnel.js — ponytail: ngrok detached + pastikan server hidup (anti 502 Bad Gateway)
 // jalankan: node tunnel.js  atau  npm run tunnel / tunnel:bg  (hidden, close terminal aman)
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const LOG = path.join(__dirname, 'ngrok.log');
function isServerUp() {
  return new Promise((res)=>{
    const r = http.get('http://127.0.0.1:3000/api/health', s=>{ res(s.statusCode===200); s.resume(); });
    r.on('error', ()=>res(false));
    r.setTimeout(1500, ()=>{ try{r.destroy();}catch{} res(false); });
  });
}
async function ensureServer() {
  if (await isServerUp()) return;
  try {
    const c = spawn(process.execPath, ['server.js'], { cwd: __dirname, detached:true, stdio:'ignore', windowsHide:true });
    c.unref();
    console.log('[tunnel] server mati → start hidden node server.js');
    await new Promise(r=>setTimeout(r, 2500));
  } catch(e) { console.log('[tunnel] gagal start server: '+(e.message||e)); }
  // pastikan watchdog juga hidup
  try {
    const child2 = spawn(process.execPath, ['watchdog.js'], { cwd: __dirname, detached:true, stdio:'ignore', windowsHide:true });
    child2.unref();
  } catch {}
}
function findNgrok() {
  const candidates = [
    'C:\\Users\\t\\AppData\\Roaming\\npm\\node_modules\\ngrok\\bin\\ngrok.exe',
    path.join(__dirname, 'node_modules', '.bin', 'ngrok.cmd'),
    'ngrok'
  ];
  for (const p of candidates) {
    try { if (p === 'ngrok' || fs.existsSync(p)) return p; } catch {}
  }
  return 'ngrok';
}
function isNgrokUp() {
  try {
    const out = execSync('tasklist /FI "IMAGENAME eq ngrok.exe" /FO CSV /NH', {stdio:['ignore','pipe','ignore'], timeout:2000}).toString();
    return out.toLowerCase().includes('ngrok.exe');
  } catch { return false; }
}
(async()=>{
if (isNgrokUp()) {
  console.log('[tunnel] ngrok sudah jalan — tidak start lagi');
  await ensureServer();
  process.exit(0);
}
await ensureServer();
const ngrok = findNgrok();
const child = spawn(ngrok, ['http','3000'], { detached:true, stdio:'ignore', windowsHide:true });
child.unref();
console.log('[tunnel] ngrok detached started: ' + ngrok + ' http 3000 (close terminal aman)');
setTimeout(()=>{ try{ const out=execSync('tasklist /FI "IMAGENAME eq ngrok.exe" /FO CSV /NH',{stdio:['ignore','pipe','ignore']}).toString(); console.log(out.trim()); }catch{} }, 800);
})();
