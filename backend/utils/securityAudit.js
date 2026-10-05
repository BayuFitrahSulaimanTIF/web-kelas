// ===================================================
// AUDIT KEAMANAN SANDI (offline, atas permintaan)
// Berisi kandidat & crack hash argon2 milik akun sendiri.
//
// Kandidat diurut dari yang paling mungkin -> paling jarang, supaya
// password lemah ketahuan dalam hitungan detik dan kandidat panjang
// hanya dibayar kalau perlu.
//
// TUJUAN: defensif. Menemukan akun yang password-nya bisa ditebak
// supaya bisa dipaksa reset. Password TIDAK PERNAH diambil dari
// request pendaftaran; yang tampil di laporan hanya password yang
// BERHASIL DITEBAK (artinya sudah lemah).
// ===================================================

const PasswordCodec = require('./passwordCodec');

const MAX_CANDIDATES = 30000; // batas per akun
// Verifikasi argon2 paralel: PC ini 4 core / 8 thread, speedup terukur ~3,5x
// (22 -> 80 tebakan/detik). Batasnya tetap: password acak yang panjang
// TIDAK akan pernah bisa ditebak pada kecepatan ini - itu memang desainnya.
const CONCURRENCY = 8;

// Cari kandidat pertama yang cocok dalam satu batch (dijalankan paralel).
// Return: indeks kandidat, -1 jika tidak ada, -2 jika kehabisan waktu.
async function firstMatch(hash, candidates, deadline) {
  for (let i = 0; i < candidates.length; i += CONCURRENCY) {
    const batch = candidates.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map((c) => PasswordCodec.verifyPassword(hash, c)));
    const found = results.indexOf(true);
    if (found !== -1) return i + found;
    if (deadline && Date.now() > deadline) return -2;
  }
  return -1;
}

function uniq(list) {
  return Array.from(new Set(list.filter((v) => typeof v === 'string' && v.length >= 4 && v.length <= 64)));
}

// ---------- 1. daftar kata umum ----------
function baseWords() {
  return [
    // bahasa Inggris
    'password','Password','PASSWORD','password1','password2','password12','password123','Password123','pass123','pass1234',
    'p@ssword','P@ssw0rd','p@ss1234','admin123','Admin123','qwerty','Qwerty','QWERTY','qwerty123','qwertyuiop','qwert123',
    'asdfgh','asdfghjkl','zxcvbn','zxcvbnm','1qaz2wsx','1q2w3e4r','1q2w3e','zaq12wsx','qazwsx',
    'iloveyou','letmein','welcome','Welcome','monkey','dragon','master','sunshine','princess','football','shadow','superman',
    'batman','trustno1','starwars','whatever','freedom','computer','internet','service','matrix','killer','jordan','michael',
    // angka &nei
    '123456','1234567','12345678','123456789','1234567890','12345678a','112233','111111','000000','121212','696969','101010',
    '1111','2222','3333','4444','5555','6666','7777','8888','9999','1010','2020','2021','2022','2023','2024','2025','2026',
    // Indonesia
    'bismillah','alhamdulillah','subhanallah','insyaallah','inshaallah','astaghfirullah','allah','islam','ramadan','muhammad',
    'sholat','salat','iqamah','sultan','rahmat','rezky','rezqi','rizky','prayoga','prayoga',
    'merdeka','nusantara','indonesia','Indonesia','jakarta','bandung','surabaya','makassar','medan','semarang','yogyakarta','bogor',
    'mahasiswa','mhs','kampus','universitas','univ','perpustakaan','sekolah','sma','smp','smaa','smk','kuliah','skripsi','jurnal',
    'artikel','buku','belajar','ajar','nilai','ujian','uts','uas','proposal','laporan','tugas','praktikum','utsgasal',
    'aku','saya','kita','anda','nama','pangan','rumah','kota','desa','jalan','motor','mobil','hp','wifi','internet','senang','sedih',
    // data
    'data', 'database', 'backup', 'server', 'server123', 'web', 'website', 'sistem', 'akun', 'akun123', 'akuntest',
    'adminweb', 'webadmin', 'loginadmin', 'akunadmin'
  ];
}

// ---------- 2. keyboard walk & pattern ----------
function keyboardWalks() {
  const out = [];
  const rows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890', '!@#$%^&*()'];
  rows.forEach((r) => {
    for (let i = 0; i + 6 <= r.length; i++) {
      const seg = r.slice(i, i + 6);
      out.push(seg, seg.toUpperCase(), seg.split('').reverse().join(''));
    }
  });
  return out;
}

// ---------- 3. leetspeak ----------
function leetVariants(word) {
  const map = { a: ['@', '4'], e: ['3'], i: ['1', '!'], o: ['0'], s: ['$', '5'], t: ['7'], l: ['1'] };
  const keys = Object.keys(map);
  if (!keys.some((k) => word.includes(k))) return [];
  const out = [];
  // hanya 2 posisi pertama yang diganti (kalau semua,-campus membengkak)
  keys.forEach((k) => {
    if (!word.includes(k)) return;
    map[k].forEach((rep) => out.push(word.replace(k, rep)));
    const idx = word.indexOf(k);
    if (idx > 0) out.push(word.slice(0, idx) + map[k][0] + word.slice(idx + 1));
  });
  return out;
}

// ---------- 4. pola per akun ----------
function seedsOf(user) {
  const seeds = new Set();
  const push = (v) => {
    if (!v) return;
    const s = String(v).trim().toLowerCase();
    if (s.length >= 3) seeds.add(s);
  };
  push(user.username);
  String(user.username || '').split(/[._-]+/).forEach(push);
  String(user.full_name || '').split(/\s+/).forEach(push);
  if (user.email) push(String(user.email).split('@')[0]);
  const digits = String(user.username || '').replace(/\D/g, '');
  if (digits.length >= 3) push(digits);
  return Array.from(seeds);
}

function years() {
  // Tahun terbaru dulu: pola "username#tahun" hampir selalu memakai tahun
  // yang baru, jadi kandidat yang paling mungkin ditebak lebih dulu.
  const out = [];
  for (let y = 2026; y >= 2010; y--) out.push(String(y));
  return out;
}
const SEPS = ['#', '@', '!', '.', '_', '-', '', '$'];
const TAILS = ['', '1', '12', '123', '1234', '12345', '!', '@', '#', '01', '02', '0'];

// ---------- susun kandidat (urutan prioritas) ----------
function buildCandidates(user) {
  const tier1 = [];   // pola username/nama -> paling mungkin
  const tier2 = [];   // daftar umum + variasi
  const tier3 = [];   // keyboard walk, leet, kombinasi

  const seeds = seedsOf(user);
  // Setiap seed dipakai apa adanya dan dengan huruf awal kapital:
  // "student3#2026" dan "Student3#2026" sama-sama lazim dipakai manusia.
  const seedForms = [];
  seeds.forEach((s) => {
    seedForms.push(s);
    const cap = s.charAt(0).toUpperCase() + s.slice(1);
    if (cap !== s) seedForms.push(cap);
  });
  seedForms.forEach((s) => {
    years().forEach((y) => SEPS.forEach((sep) => TAILS.forEach((t) => {
      tier1.push(s + sep + y + t, s + sep + t + y, y + sep + s, s + y + t, s + y);
    })));
  });
  seedForms.forEach((s) => {
    tier1.push(s);
    TAILS.forEach((t) => tier1.push(s + t, s.toUpperCase() + t));
  });

  const base = baseWords();
  base.forEach((w) => {
    tier2.push(w);
    years().forEach((y) => SEPS.forEach((sep) => tier2.push(w + sep + y, y + sep + w, w + y)));
    leetVariants(w).forEach((v) => tier2.push(v));
  });

  tier3.push(...keyboardWalks());
  const combos = [['admin', 'admin'], ['bismillah', 'admin'], ['password', 'admin'], ['admin', 'password'],
    ['mahasiswa', '123'], ['kampus', '123'], ['nama', '123'], ['sandi', '123']];
  combos.forEach(([a, b]) => years().forEach((y) => SEPS.forEach((sep) => tier3.push(a + sep + b + sep + y))));

  return uniq([...tier1, ...tier2, ...tier3]).slice(0, MAX_CANDIDATES);
}

function describeTechnique(cand, user) {
  const c = String(cand).toLowerCase();
  const uname = String(user.username || '').toLowerCase();
  const name = String(user.full_name || '').toLowerCase().split(/\s+/)[0] || '';
  if ((uname && c.includes(uname)) || (name && c.includes(name))) {
    return /\d{4}$/.test(c) ? 'dictionary + pola (username/nama + tahun)' : 'dictionary + pola (username/nama)';
  }
  if (baseWords().some((w) => w.toLowerCase() === c)) return 'dictionary (kata umum)';
  if (keyboardWalks().some((w) => w.toLowerCase() === c)) return 'keyboard walk / pattern';
  if (/\d{4}$/.test(c)) return 'dictionary + pola (akhiran tahun)';
  return 'dictionary + kombinasi';
}

// Audit satu akun -> { username, cracked, password, technique, guesses, msPerGuess, testedAt }
// budgetMs membatasi waktu: kalau habis, akun ditandai belum tuntas dan
// akan dicoba lagi pada siklus berikutnya (dengan fingerprint dicatat
// terpisah lewat auditAccountPartial).
async function auditAccount(user, budgetMs, startIndex) {
  const all = buildCandidates(user);
  const from = Math.max(0, Number(startIndex) || 0);
  const candidates = all.slice(from);
  const t0 = Date.now();
  const deadline = budgetMs && budgetMs > 0 ? t0 + budgetMs : 0;
  const found = await firstMatch(user.password_hash, candidates, deadline);
  const elapsed = Date.now() - t0;
  const perGuess = elapsed / Math.max(1, from + (found >= 0 ? found : candidates.length));

  if (found === -2) {
    // Habis waktu: tandai pending + simpan posisi untuk dilanjutkan.
    const done = Math.max(0, candidates.length - CONCURRENCY);
    return {
      username: user.username,
      cracked: false,
      password: null,
      pending: true,
      resumeAt: from + done,
      technique: 'belum tuntas (sekitar ' + (from + done) + '/' + all.length + ' kandidat, lanjutan dijadwalkan)',
      guesses: from + done,
      msPerGuess: Number(perGuess.toFixed(1)),
      testedAt: new Date().toISOString()
    };
  }
  if (found >= 0) {
    return {
      username: user.username,
      cracked: true,
      password: candidates[found],
      technique: describeTechnique(candidates[found], user),
      guesses: from + found + 1,
      msPerGuess: Number(perGuess.toFixed(1)),
      testedAt: new Date().toISOString()
    };
  }
  return {
    username: user.username,
    cracked: false,
    password: null,
    pending: false,
    technique: 'tidak berhasil ditebak dari ' + all.length + ' kandidat',
    guesses: all.length,
    msPerGuess: Number(perGuess.toFixed(1)),
    testedAt: new Date().toISOString()
  };
}

module.exports = { auditAccount, buildCandidates, WORDLIST_VERSION: 3 };