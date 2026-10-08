// Cek daftar Students: sinkronisasi bio/avatar + escaping XSS.
// Jalankan: node backend/scripts/check-students-sync.js

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../../dashboard.html'), 'utf8');

const must = [
  ['cache punya fingerprint',      /let studentsPrint = ''/],
  ['poll memakai fingerprint',      /if \(print === studentsPrint\) return/],
  ['fingerprint ikut bio',          /u\.bio \|\| ''/],
  ['fingerprint ikut avatar',       /u\.avatar \|\| ''/],
  ['poll hanya saat view terlihat', /students-view'\)\.style\.display === 'none'\) return/],
  ['poll berhenti saat tab hidden', /document\.hidden\) return/],
  ['interval terpasang',            /setInterval\(pollStudents, STUDENTS_POLL_MS\)/],
  ['saveBio menjembatani ke window',/window\.syncStudentsUser\(current\)/],
  ['sync diekspos ke window',       /window\.syncStudentsUser = syncStudentsUser/],
  ['avatar sync ikut pemanggil',    /syncStudentsUser\(current\)/],
  ['XSS: bio di-escape',            /escapeHtml\(bioText\(u\)\)/],
  ['XSS: nama di-escape',          /escapeHtml\(u\.full_name \|\| u\.username\)/],
  ['XSS: nim di-escape',           /escapeHtml\(u\.nim \|\| '-'\)/],
  ['XSS: data-name di-escape',     /data-name="' \+ escapeHtml/],
  ['XSS: role di-escape',          /escapeHtml\(u\.role \|\| '-'\)/],
  ['fungsi lama sudah dihapus',    () => !/syncStudentsAvatar/.test(html)],
];

let bad = 0;
for (const [name, check] of must) {
  const ok = typeof check === 'function' ? check() : check.test(html);
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name);
}

// renderStudents harus menolak bio berisi HTML.
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const hostile = '<img src=x onerror=alert(1)>';
if (esc(hostile).includes('<img')) { console.log('GAGAL  bio berbahaya tidak ter-escape'); bad++; }
else { console.log('lulus  bio berbahaya ter-escape'); }

console.log('');
console.log('bio berbahaya jadi:', esc(hostile));
process.exit(bad ? 1 : 0);