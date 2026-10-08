// Token login dipakai bersama beberapa skrip check agar tidak menumpuk
// percobaan login dan kena rate limiter. Disimpan di temp dir, bukan repo.
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.env.CHECK_BASE || 'http://localhost:3000';
const cacheFile = path.join(os.tmpdir(), 'web-kelas-check-token.json');

function readCache() {
  try { return JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (e) { return {}; }
}

function writeCache(obj) {
  try { fs.writeFileSync(cacheFile, JSON.stringify(obj)); } catch (e) {}
}

async function usable(token) {
  if (!token) return false;
  const r = await fetch(BASE + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });
  return r.ok;
}

// Token yang sama dipakai ulang selama masih valid; kalau kedaluwarsa
// skrip login sekali saja lalu menyimpan yang baru.
async function tokenFor(username, password) {
  const cache = readCache();
  if (await usable(cache[username])) return cache[username];

  const r = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  if (!r.ok) throw new Error('login gagal untuk ' + username + ' (status ' + r.status + ')');

  const d = await r.json();
  cache[username] = d.token;
  writeCache(cache);
  return d.token;
}

module.exports = { BASE, tokenFor };