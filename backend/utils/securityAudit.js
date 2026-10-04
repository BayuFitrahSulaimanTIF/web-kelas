// ===================================================
// AUDIT KEAMANAN SANDI (offline, atas permintaan)
// Berisi kandidat & crack hash argon2 milik akun sendiri.
// Dijalankan manual (bukan per request) supaya server tidak承担 beban brute-force.
// ===================================================

const PasswordCodec = require('./passwordCodec');

function baseWords() {
  return [
    'password','Password','PASSWORD','password1','password12','password123','Password123','pass123','p@ssword','P@ssw0rd',
    '123456','1234567','12345678','123456789','1234567890','12345678a','112233','111111','000000','121212','696969',
    'qwerty','Qwerty','QWERTY','qwerty123','qwertyuiop','asdfgh','asdfghjkl','zxcvbn','1qaz2wsx','1q2w3e4r',
    'admin','Admin','ADMIN','admin123','Admin123','administrator','root','toor','user','User','guest','Guest','test','testing','demo',
    'secret','Secret','letmein','welcome','Welcome','monkey','dragon','master','iloveyou','sunshine','princess','football','shadow',
    'bismillah','alhamdulillah','subhanallah','insyaallah','astaghfirullah','allah','islam','ramadan','muhammad',
    'merdeka','nusantara','indonesia','Indonesia','jakarta','bandung','surabaya','makassar','medan','semarang','yogyakarta',
    'mahasiswa','kampus','universitas','perpustakaan','sekolah','sma','smp','smaa','smk','kuliah','skripsi','jurnal','artikel',
    'buku','belajar','ajar','sekolah','nilai','ujian','uts','uas','proposal','skripsi','laporan','tugas','praktikum',
    'aku','saya','kita','anda','nama','pangan','rumah','kota','desa','jalan','motor','mobil','hp','wifi','internet'
  ];
}

function keyboardWalks() {
  const out = [];
  const rows = ['qwertyuiop','asdfghjkl','zxcvbnm','1234567890'];
  rows.forEach(r => { for (let i = 0; i + 6 <= r.length; i++) out.push(r.slice(i, i + 6), r.slice(i, i + 6).toUpperCase()); });
  return out;
}

function years() {
  const out = [];
  for (let y = 2015; y <= 2026; y++) out.push(String(y));
  return out;
}

function seps() { return ['#', '@', '!', '.', '_', '-', '', '$']; }
function tails() { return ['', '1', '12', '123', '1234', '!', '@', '#', '01', '02', '12345']; }

// Kandidat spesifik per akun: username, nama depan/belakang, NIM, email lokal.
function accountSeeds(user) {
  const seeds = new Set();
  const push = (v) => { if (v && String(v).length >= 3) seeds.add(String(v).toLowerCase()); };
  push(user.username);
  String(user.username || '').split(/[._-]+/).forEach(push);
  String(user.full_name || '').toLowerCase().split(/\s+/).forEach(push);
  if (user.email) push(String(user.email).split('@')[0]);
  const digits = String(user.username || '').replace(/\D/g, '');
  if (digits.length >= 3) push(digits);
  return Array.from(seeds);
}

function buildCandidates(user) {
  const set = new Set();
  const add = (v) => { if (v && v.length >= 4 && v.length <= 64) set.add(v); };
  baseWords().forEach(add);
  keyboardWalks().forEach(add);
  years().forEach(add);

  const seeds = accountSeeds(user);
  seeds.forEach(s => {
    add(s);
    years().forEach(y => seps().forEach(sep => tails().forEach(t => {
      add(s + sep + y + t);
      add(s + sep + t + y);
      add(y + sep + s);
      add(s + y + t);
      add(s + y);
    })));
    tails().forEach(t => { add(s + t); add(s.toUpperCase() + t); add(s + '@' + t); });
    //kapitalisasi
    add(s.charAt(0).toUpperCase() + s.slice(1));
  });

  // kombinasi dua kata umum yang sering dipakai mahasiswa
  const pairs = [['admin', 'admin'], ['bismillah', 'admin'], ['password', 'admin'], ['admin', 'password'], ['mahasiswa', '123'], ['kampus', '123']];
  pairs.forEach(([a, b]) => years().forEach(y => seps().forEach(sep => add(a + sep + b + sep + y))));

  return Array.from(set);
}

// Audit: kembalikan { username, cracked, password|null, technique, guesses, msPerGuess }
async function auditAccount(user) {
  const candidates = buildCandidates(user);
  const t0 = Date.now();
  for (const cand of candidates) {
    if (await PasswordCodec.verifyPassword(user.password_hash, cand)) {
      const ms = (Date.now() - t0) / candidates.length;
      return {
        username: user.username,
        cracked: true,
        password: cand,
        technique: describeTechnique(cand, user),
        guesses: candidates.length,
        msPerGuess: Number(ms.toFixed(1))
      };
    }
  }
  return {
    username: user.username,
    cracked: false,
    password: null,
    technique: 'tidak berhasil ditebak dari ' + candidates.length + ' kandidat',
    guesses: candidates.length,
    msPerGuess: Number(((Date.now() - t0) / candidates.length).toFixed(1))
  };
}

function describeTechnique(cand, user) {
  const c = cand.toLowerCase();
  const uname = String(user.username || '').toLowerCase();
  if (uname && c.includes(uname) && /\d{4}$/.test(c)) return 'dictionary + pola (username + tahun)';
  if (uname && c.includes(uname)) return 'dictionary + pola (username)';
  if (baseWords().includes(c)) return 'dictionary (kata umum)';
  if (keyboardWalks().includes(c)) return 'keyboard walk / pattern';
  return 'dictionary + pola (kombinasi)';
}

module.exports = { auditAccount, buildCandidates };
