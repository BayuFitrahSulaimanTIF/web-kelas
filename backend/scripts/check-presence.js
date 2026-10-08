// Cek status kehadiran (presence): frontend + backend.
// Jalankan: node backend/scripts/check-presence.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dash = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const ctrl = fs.readFileSync(path.join(root, 'backend/controllers/usersController.js'), 'utf8');
const model = fs.readFileSync(path.join(root, 'backend/models/User.js'), 'utf8');
const routes = fs.readFileSync(path.join(root, 'backend/routes/users.js'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'database/schema.sql'), 'utf8');
const server = fs.readFileSync(path.join(root, 'backend/server.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

let bad = 0;
const check = (name, ok) => { if (!ok) bad++; console.log((ok ? 'lulus  ' : 'GAGAL  ') + name); };

console.log('-- tidak boleh menyentuh is_active --');
check('is_active tidak ditulis saat heartbeat',
  !/UPDATE users SET[^;]*is_active\s*=/.test(model.replace(/activateByUsername[\s\S]*?\n\s*\},/, '')));
check('presence pakai kolom terpisah',
  /UPDATE users SET last_seen_at = NOW\(\) WHERE id = \?/.test(model));
check('endpoint presence tidak menulis is_active',
  !/is_active/.test(ctrl.split('touchPresence')[1] || ''));
check('kolom baru ada di schema',
  /last_seen_at DATETIME DEFAULT NULL/.test(schema));
check('migrasi idempoten ada di server.js',
  /COLUMN_NAME='last_seen_at'/.test(server));
check('migrasi buang is_away ada di server.js',
  /DROP COLUMN is_away/.test(server));

const offlineAfter = Number(ctrl.match(/PRESENCE_OFFLINE_AFTER_S = (\d+)/)[1]);
const heartbeatMs = Number(dash.match(/PRESENCE_MS = (\d+)/)[1]);

console.log('');
console.log('-- routing backend --');
check('POST /presence terdaftar', /router\.post\('\/presence', usersController\.touchPresence\)/.test(routes));

console.log('');
console.log('-- perhitungan status --');
check('offline setelah ambang waktu', /DATE_SUB\(NOW\(\), INTERVAL \? SECOND\) THEN 'offline'/.test(ctrl));
check('ambang > interval heartbeat',
  offlineAfter * 1000 > heartbeatMs, offlineAfter + 'd > ' + heartbeatMs + 'ms');
check('NULL last_seen_at = offline', /WHEN last_seen_at IS NULL THEN 'offline'/.test(ctrl));
console.log('');
console.log('-- hanya dua status --');
check('hanya online/offline di SQL', !/THEN 'away'/.test(ctrl) && !/is_away/.test(ctrl));
check('hanya online/offline di label frontend',
  !/away/.test(dash.split('PRESENCE_LABEL = ')[1].split('\n')[0]));
check('kolom is_away dibuang dari schema', !/is_away/.test(schema));
check('kolom is_away dibuang dari model', !/is_away/.test(model));
check('badge Aktif/Nonaktif dihapus dari daftar',
  !/class="s-active/.test(dash) && !/'Aktif' : 'Nonaktif'/.test(dash));
check('CSS s-active dihapus', !/\.s-active[\s{]/.test(css));
check('CSS away dihapus', !/\.s-presence\.away/.test(css));
check('header kolom diganti Status', /<th>Status<\/th>/.test(dash));
check('header Keaktifan hilang', !/Keaktifan/.test(dash));

console.log('');
console.log('-- frontend --');
check('heartbeat dijadwalkan', /presenceTimer = window\.setInterval\(reportPresence, PRESENCE_MS\)/.test(dash));
check('visibilitychange mengirim laporan', /addEventListener\('visibilitychange', reportPresence\)/.test(dash));
check('fingerprint ikut presence', /u\.presence \|\| ''/.test(dash));
check('badge online/offline ada di CSS',
  /\.s-presence\.online/.test(css) && /\.s-presence\.offline/.test(css));
check('tabel menampilkan badge', /presenceBadge\(u\)/.test(dash));
check('kartu menampilkan badge', /presenceBadge\(u\)/.test(dash));

console.log('');
console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan presence lulus.');
process.exit(bad ? 1 : 0);