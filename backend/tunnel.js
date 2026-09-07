// tunnel.js — ponytail: ngrok detached, close terminal tetap online
// jalankan: node tunnel.js  atau  npm run tunnel:bg
const { spawn, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const LOG = path.join(__dirname, 'ngrok.log');
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
if (isNgrokUp()) {
  console.log('[tunnel] ngrok sudah jalan — tidak start lagi');
  process.exit(0);
}
const ngrok = findNgrok();
const child = spawn(ngrok, ['http','3000'], { detached:true, stdio:'ignore', windowsHide:true });
child.unref();
console.log('[tunnel] ngrok detached started: ' + ngrok + ' http 3000 (close terminal aman)');
setTimeout(()=>{ try{ const out=execSync('tasklist /FI "IMAGENAME eq ngrok.exe" /FO CSV /NH',{stdio:['ignore','pipe','ignore']}).toString(); console.log(out.trim()); }catch{} }, 800);
