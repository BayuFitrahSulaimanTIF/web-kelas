// watchdog.js — keeps server alive even when internet is down (no external fetch)
// Checks localhost:3000/health every 5s, restarts node server.js if down.
// No internet dependency, so offline overlay stays consistent (not partial page).
const http = require('http');
const { spawn, execSync } = require('child_process');
const path = require('path');

function isUp() {
  return new Promise((res) => {
    const req = http.get('http://127.0.0.1:3000/api/health', (r) => {
      res(r.statusCode === 200);
      r.resume();
    });
    req.on('error', () => res(false));
    req.setTimeout(2000, () => { try { req.destroy(); } catch {}; res(false); });
  });
}

async function ensure() {
  const up = await isUp();
  if (!up) {
    try { console.log('[watchdog] server down → restart'); } catch {}
    try {
      const out = execSync('netstat -ano | findstr :3000', { stdio: ['ignore','pipe','ignore'], timeout: 3000 }).toString();
      const m = out.match(/:3000[^\\n]*LISTENING\s+(\d+)/i) || out.match(/\s(\d+)\s*$/m);
      if (m) { try { execSync(`taskkill /F /PID ${m[1]}`, { stdio: 'ignore', timeout: 3000 }); } catch {} }
    } catch {}
    setTimeout(() => {
      const child = spawn(process.execPath, ['server.js'], {
        cwd: __dirname,
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      });
      child.unref();
    }, 800);
  }
}

setInterval(ensure, 5000);
ensure();
console.log('[watchdog] running, pid=' + process.pid);
