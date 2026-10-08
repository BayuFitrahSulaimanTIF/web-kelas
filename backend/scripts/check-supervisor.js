// Cek supervisor: server.js harus dispawn ulang seketika saat child mati,
// bukan menunggu siklus health check (penyebab ERR_NGROK_8012).
// Jalankan: node backend/scripts/check-supervisor.js

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../supervisor.js'), 'utf8');

let bad = 0;
const check = (name, ok, extra) => {
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name + (extra ? '  -> ' + extra : ''));
};

// Hitung ulang jarak downtime dari konfigurasi, bukan dari tebakan.
const checkMs = Number(src.match(/CHECK_MS = (\d+)/)[1]);
const respawn = Number(src.match(/RESPAWN_DELAY_MS = (\d+)/)[1]);

console.log('-- respawn cepat --');
check('child di-hook .on(exit)',
  /child\.on\('exit',[\s\S]{0,200}setTimeout\(startServer, RESPAWN_DELAY_MS\)/.test(src));
check('downtime tidak lagi ikut CHECK_MS', !/setTimeout\(startServer, CHECK_MS\)/.test(src),
  'CHECK_MS=' + checkMs + 'ms, respawn=' + respawn + 'ms');
check('respawn lebih cepat dari health check', respawn < checkMs, respawn + 'ms < ' + checkMs + 'ms');

console.log('');
console.log('-- cegah spawn ganda --');
check('guard berbasis timestamp ada',
  /if \(Date\.now\(\) - serverRestartAt < RESPAWN_DELAY_MS\) return;/.test(src));
check('timestamp dicatat sebelum spawn',
  /serverRestartAt = Date\.now\(\);[\s\S]{0,200}spawn\(/.test(src));
check('startServer idempoten', (src.match(/function startServer/g) || []).length === 1);

console.log('');
console.log('-- backstop tetap ada --');
// Ambil isi fungsi tick supaya tidakDipengaruhi jarak baris diela lain.
const tickBody = (src.match(/async function tick\(\)[\s\S]*?\n\}/) || [''])[0];
check('tick memanggil isServerUp', /isServerUp\(\)/.test(tickBody));
check('tick memanggil startServer saat server mati',
  /isServerUp\(\)[\s\S]*?\} else \{[\s\S]*?startServer\(\)/.test(tickBody));
check('tunnel tetap dipantau lewat API ngrok', /api\/tunnels/.test(src));

console.log('');
console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan supervisor lulus.');
process.exit(bad ? 1 : 0);