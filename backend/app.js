// ===================================================
// APP EXPRESS
// ===================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const { env } = require('./config/env');
const { pingDatabase, db } = require('./config/database');
const { isAllowedOrigin } = require('./utils/publicOrigin');
const authenticate = require('./middlewares/authenticate');
const authRoutes = require('./routes/auth');
const ssoRoutes = require('./routes/sso');
const googleAuthRoutes = require('./routes/googleAuth');
const githubAuthRoutes = require('./routes/githubAuth');
const facebookAuthRoutes = require('./routes/facebookAuth');
const cardRoutes = require('./routes/cards');
const { CARD_IMG_DIR } = require('./utils/cardsStore');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const userNotificationRoutes = require('./routes/userNotifications');
const UserNotification = require('./models/UserNotification');
// Audit keamanan sandi: brute-force dictionary atas hash milik akun sendiri,
// hasilnya muncul di bagian audit secret ebook (defensif, bukan penyimpanan
// plaintext). Jalan otomatis + bisa dipicu manual oleh admin.
const { startAutoAudit, runAudit, auditStatus, RESULT_FILE: AUDIT_RESULT_FILE } = require('./utils/auditRunner');
startAutoAudit();
// Tabel notifikasi navbar dibuat sendiri saat start (belum perlu migrasi manual).
UserNotification.ensureTable().catch((e) => console.error('Gagal membuat tabel user_notifications:', e.message));
const communityRoutes = require('./routes/community');
const requestLogger = require('./middlewares/requestLogger');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const { createRateLimiter } = require('./middlewares/rateLimiter');
const libraryUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 10, name: 'library-upload' });
const newsUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 15, name: 'news-upload' });
const User = require('./models/User');

const app = express();

app.use(requestLogger);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // accounts.google.com wajib untuk Google Identity Services: pustakanya
      // dimuat sebagai script, tombolnya digambar di dalam iframe, dan
      // pustaka itu juga menghubungi domain yang sama. Tanpa ketiganya
      // CSP memblokir dan tombol tidak pernah muncul.
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://accounts.google.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "http://localhost:3000", "https://accounts.google.com", "https://*.lhr.life", "https://*.serveousercontent.com", "https://*.devtunnels.ms", "https://*.asse.devtunnels.ms", "https://*.ngrok-free.dev", "https://*.ngrok-free.app", "https://*.onrender.com", "https://*.up.railway.app", "https://1.1.1.1", "https://connectivitycheck.gstatic.com", "https://www.google.com"],
      frameSrc: ["'self'", "blob:", "data:", "https://accounts.google.com", "https://view.officeapps.live.com"],
      childSrc: ["'self'", "blob:", "data:"],
      objectSrc: ["'self'", "blob:", "data:"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  // COOP WAJIB dimatikan untuk login Google. Helmet mengaktifkan
  // 'same-origin' secara default, yang membuat window.opener bernilai
  // null di popup Google. Popup itu mengirim credential balik lewat
  // postMessage; tanpa opener, halaman accounts.google.com/gsi/transform
  // menggantung putih selamanya, popup tidak menutup, dan callback
  // tidak pernah terpanggil. COOP tidak berguna di sini karena COEP
  // sudah dimatikan (tidak ada SharedArrayBuffer yang dipakai).
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const _corsIsAllowed = isAllowedOrigin;
app.use(cors({
  origin: (origin, cb)=>{
    if(_corsIsAllowed(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ponytail: wajib internet â€” jika offline, halaman HTML (/) diblokir dengan
// ponytail: server tetap layani HTML bahkan saat offline â€” blokir ditangani
// di frontend (connectivity.js) agar tidak false-positive "tidak bisa diakses padahal online"
// (fetch generate_204 di server rawan terblokir firewall/proxy). Cache tetap no-store.


// Statis selalu divalidasi ulang ke server (max-age=0) agar perubahan
// dashboard.html/style.css langsung terlihat tanpa cache tersimpan lama.
// Guard: folder backend/ dan file tersembunyi (dotfile) TIDAK boleh disajikan
// lewat HTTP. Tanpa ini, seluruh source server + news.json bisa diunduh lewat
// tunnel ngrok hanya dengan mengetik /backend/app.js.
app.use((req, res, next) => {
  let p = req.path;
  try { p = decodeURIComponent(p); } catch (e) {}
  if (/(^|\/)backend(\/|$)/i.test(p) || p.split('/').some((seg) => seg.charAt(0) === '.')) {
    return res.status(404).send('Not found');
  }
  next();
});
app.use(express.static(path.join(__dirname, '..'), { maxAge: 0, etag: true }));

// Dashboard (dashboard.html berada di root yang sama)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard.html'));
});

// ============ LIBRARY (folder e-book lokal) ============
const { LIBRARY_DIR, listLibraryFiles, invalidateLibraryCache } = require('./utils/libraryWalk');

app.use('/library/files', express.static(LIBRARY_DIR, {
  setHeaders: (res, p)=>{
    res.set('X-Content-Type-Options','nosniff');
    const ext = String(p).split('.').pop().toLowerCase();
    // ponytail: media inline agar <img>/<video>/iframe bisa tampil; attachment hanya untuk Office
    if(!['pdf','jpg','jpeg','png','gif','txt','mp4'].includes(ext)) res.set('Content-Disposition','attachment; filename="'+String(p).split('/').pop()+'"');
  }
}));

// Foto profil pengguna (avatar) â€” akses publik untuk ditampilkan
const { AVATAR_DIR } = require('./utils/avatarUpload');
app.use('/uploads/avatars', express.static(AVATAR_DIR, {
  setHeaders: (res)=>res.set('X-Content-Type-Options','nosniff')
}));

app.get('/api/library/files', (req, res) => {
  try {
    const meta = readLibraryMeta();
    // ?refresh=1 memaksa scan ulang (mis. setelah file ditambah lewat Explorer)
    const files = listLibraryFiles(req.query.refresh === '1');
    // ponytail: style/tahun/bahasa disimpan terpisah (library_meta.json) supaya
    // nama file tetap bersih judul saja â€” tidak ada prefix STYLE_LANG_YEAR.
    const payload = {
      files: files.map((f) => {
        const m = meta[f.relativePath];
        return m ? Object.assign({}, f, m) : f;
      })
    };
    // Ribuan ebook = JSON >1 MB; zlib bawaan Node memangkas Â±85% tanpa dependency baru.
    if (String(req.headers['accept-encoding'] || '').indexOf('gzip') !== -1) {
      res.set('Content-Type', 'application/json; charset=utf-8');
      res.set('Content-Encoding', 'gzip');
      res.set('Vary', 'Accept-Encoding');
      return res.send(zlib.gzipSync(JSON.stringify(payload)));
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ UPLOAD KE LIBRARY (kategori + style/tahun/bahasa) ============
const LIBRARY_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt', 'mp4']);
const LIBRARY_CATEGORIES = new Set(['jurnal', 'artikel', 'skripsi']);
const LIBRARY_STYLES = new Set(['APA', 'SINTA', 'INTL', 'ARXIV', 'IEEE', 'OA']);
const LIBRARY_YEARS = new Set(['2018','2019','2020','2021','2022','2023','2024','2025','2026']);
const LIBRARY_LANGS = new Set(['EN', 'ID']);
const MAX_LIBRARY_BYTES = 1024 * 1024 * 1024; // 1 GB per file

// Metadata style/tahun/bahasa per path relatif. Dipisah dari nama file supaya
//Judul di kartu tetap bersih (tanpa prefix format) dan tidak perlu rename file.
const LIBRARY_META_FILE = path.join(__dirname, 'library_meta.json');
function readLibraryMeta() {
  try {
    const parsed = JSON.parse(fs.readFileSync(LIBRARY_META_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return {};
}
function writeLibraryMeta(data) {
  fs.writeFileSync(LIBRARY_META_FILE, JSON.stringify(data, null, 2));
}
// 'Lainnya' / kosong = tidak ada style
function cleanLibraryStyle(v) {
  const s = String(v || '').trim().toUpperCase();
  return LIBRARY_STYLES.has(s) ? s : '';
}
function cleanLibraryYear(v) {
  const s = String(v || '').trim();
  return LIBRARY_YEARS.has(s) ? s : '';
}
function cleanLibraryLang(v) {
  const s = String(v || '').trim().toUpperCase();
  return LIBRARY_LANGS.has(s) ? s : '';
}

function sanitizeLibraryTopic(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

function sanitizeLibraryName(name) {
  const clean = String(name || '')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return clean || 'file';
}

function uniqueLibraryName(dir, name) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 1;
  while (fs.existsSync(path.join(dir, stem + ' (' + i + ')' + ext))) i++;
  return stem + ' (' + i + ')' + ext;
}
function isValidLibraryMagic(filePath, ext){
  try{
    const fd = fs.openSync(filePath,'r');
    const buf = Buffer.alloc(8);
    const n = fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    if(n<4) return ext==='txt';
    const h = buf.toString('hex').toLowerCase();
    const s4 = buf.slice(0,4).toString();
    if(['pdf'].includes(ext)) return s4==='%PDF';
    if(['jpg','jpeg'].includes(ext)) return h.startsWith('ffd8ff');
    if(['png'].includes(ext)) return h.startsWith('89504e47');
    if(['gif'].includes(ext)) return s4.startsWith('GIF');
    if(['doc','docx','ppt','pptx'].includes(ext)) return h.startsWith('504b0304') || h.startsWith('d0cf11e0');
    if(['mp4'].includes(ext)) return buf.slice(4,8).toString() === 'ftyp';
    if(['txt'].includes(ext)) return true;
    return true;
  }catch{ return false; }
}

const libraryUploader = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      // File ditulis ke folder staging dulu; field category/topic belum tentu
      // ter-parse saat destination dipanggil, jadi validasi & pemindahan
      // dilakukan di handler setelah seluruh body multipart selesai.
      if (!req.libraryStaging) {
        req.libraryStaging = path.join(LIBRARY_DIR, '.staging', Date.now() + '-' + crypto.randomUUID());
        fs.mkdirSync(req.libraryStaging, { recursive: true });
      }
      cb(null, req.libraryStaging);
    },
    filename: (req, file, cb) => {
      cb(null, sanitizeLibraryName(file.originalname));
    }
  }),
  limits: { fileSize: MAX_LIBRARY_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    if (!LIBRARY_EXTENSIONS.has(ext)) {
      return cb(new Error('Hanya PDF, dokumen Office, gambar, dan .txt yang diizinkan'));
    }
    cb(null, true);
  }
});

function cleanupLibraryStaging(req) {
  if (req.libraryStaging && fs.existsSync(req.libraryStaging)) {
    fs.rmSync(req.libraryStaging, { recursive: true, force: true });
  }
}

function requireLibraryAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Fitur ini khusus admin' });
  }
  next();
}

app.post('/api/library/upload', authenticate, requireLibraryAdmin, libraryUploadLimiter, (req, res) => {
  libraryUploader.array('file', 10)(req, res, (err) => {
    if (err) {
      cleanupLibraryStaging(req);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Ukuran file melebihi batas 1 GB' });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ message: 'Maksimal 10 file dalam satu pengiriman' });
      }
      return res.status(400).json({ message: err.message || 'Gagal mengunggah file' });
    }
    if (!req.files || req.files.length === 0) {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'File wajib diunggah' });
    }
    const category = String(req.body.category || '').trim().toLowerCase();
    const topic = sanitizeLibraryTopic(req.body.topic);
    if (!LIBRARY_CATEGORIES.has(category)) {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Kategori wajib diisi: jurnal, artikel, atau skripsi' });
    }
    // Mata kuliah wajib untuk jurnal/artikel; skripsi boleh kosong (taruh di root skripsi/)
    if (!topic && category !== 'skripsi') {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Mata kuliah wajib diisi' });
    }
    const style = cleanLibraryStyle(req.body.style);
    const year = cleanLibraryYear(req.body.year);
    const lang = cleanLibraryLang(req.body.lang);
    // tolak nilai yang tidak dikenal (bukan diam-diam diabaikan)
    const rawStyle = String(req.body.style || '').trim().toUpperCase();
    if (rawStyle && !style && rawStyle !== 'OTHER' && rawStyle !== 'LAINNYA') {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Style harus: ' + Array.from(LIBRARY_STYLES).join(', ') });
    }
    const rawYear = String(req.body.year || '').trim();
    if (rawYear && !year) {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Tahun harus 2018-2026' });
    }
    const rawLang = String(req.body.lang || '').trim().toUpperCase();
    if (rawLang && !lang) {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Bahasa harus EN atau ID' });
    }
    for(const f of req.files){
      const ext = String(f.originalname||f.filename).split('.').pop().toLowerCase();
      const fp = path.join(req.libraryStaging, f.filename);
      if(!isValidLibraryMagic(fp, ext)){ cleanupLibraryStaging(req); return res.status(400).json({ message: `File ${f.originalname} ditolak: isi file tidak sesuai tipe ${ext} (kemungkinan malware/palsu)` }); }
    }

    try {
      const targetDir = topic ? path.join(LIBRARY_DIR, category, topic) : path.join(LIBRARY_DIR, category);
      fs.mkdirSync(targetDir, { recursive: true });
      const meta = readLibraryMeta();
      const saved = req.files.map((f) => {
        const finalName = uniqueLibraryName(targetDir, f.filename);
        fs.renameSync(path.join(req.libraryStaging, f.filename), path.join(targetDir, finalName));
        const relative = (topic ? category + '/' + topic + '/' : category + '/') + finalName;
        // nama file tetap apa adanya (judul bersih); style/tahun/bahasa di meta
        if (style || year || lang) meta[relative] = { style, year, lang };
        return { relativePath: relative, name: finalName, size: f.size, style, year, lang };
      });
      if (Object.keys(meta).length) writeLibraryMeta(meta);
      cleanupLibraryStaging(req);
      invalidateLibraryCache();
      res.json({ files: saved });
    } catch (moveError) {
      cleanupLibraryStaging(req);
      res.status(500).json({ message: 'Gagal menyimpan file: ' + moveError.message });
    }
  });
});

// ============ UBAH NAMA / HAPUS FILE LIBRARY (khusus admin) ============
// Path relatif seperti 'jurnal/basis_data/file.pdf' atau 'skripsi/file.pdf';
// tanpa subfolder lain & tanpa '..'. 'skripsi' boleh tanpa mata kuliah.
function resolveLibraryFile(relPath) {
  let decoded;
  try { decoded = decodeURIComponent(String(relPath || '')); } catch (e) { return null; }
  const parts = decoded.split('/');
  if (parts.length < 2 || parts.length > 3) return null;
  const category = parts[0];
  if (!LIBRARY_CATEGORIES.has(category)) return null;
  const hasTopic = parts.length === 3;
  const topic = hasTopic ? parts[1] : '';
  const name = hasTopic ? parts[2] : parts[1];
  if (hasTopic && (!topic || topic !== sanitizeLibraryTopic(topic))) return null;
  if (!name || name.indexOf('..') !== -1) return null;
  const full = path.resolve(LIBRARY_DIR, ...(hasTopic ? [category, topic, name] : [category, name]));
  const root = path.resolve(LIBRARY_DIR) + path.sep;
  if (full.indexOf(root) !== 0) return null;
  return {
    category,
    topic: hasTopic ? topic : '',
    name,
    full,
    relative: (hasTopic ? category + '/' + topic + '/' : category + '/') + name
  };
}

app.patch('/api/library/files', authenticate, requireLibraryAdmin, (req, res) => {
  const target = resolveLibraryFile(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  if (!fs.existsSync(target.full)) return res.status(404).json({ message: 'File tidak ditemukan' });
  // ponytail: edit lengkap â€” nama boleh tanpa .pdf, kategori & matkul bisa dipindah
  let newNameRaw = req.body.newName != null ? String(req.body.newName).trim() : target.name;
  if (!newNameRaw) return res.status(400).json({ message: 'Nama file tidak boleh kosong' });
  let newName = sanitizeLibraryName(newNameRaw);
  let dot = newName.lastIndexOf('.');
  const origExt = path.extname(target.name).toLowerCase().slice(1);
  if (dot <= 0 || dot === newName.length - 1) {
    if (!newName) return res.status(400).json({ message: 'Nama file tidak valid' });
    newName = newName + '.' + (origExt || 'pdf');
    dot = newName.lastIndexOf('.');
  }
  const newExt = newName.slice(dot + 1).toLowerCase();
  if (!LIBRARY_EXTENSIONS.has(newExt)) {
    return res.status(400).json({ message: 'Ekstensi tidak diizinkan. Gunakan: ' + Array.from(LIBRARY_EXTENSIONS).join(', ') });
  }
  let newCategory = target.category;
  if (req.body.newCategory != null && String(req.body.newCategory).trim() !== '') {
    const c = String(req.body.newCategory).trim().toLowerCase();
    if (!LIBRARY_CATEGORIES.has(c)) return res.status(400).json({ message: 'Kategori harus jurnal, artikel, atau skripsi' });
    newCategory = c;
  }
  let newTopic = target.topic;
  if (req.body.newTopic != null && String(req.body.newTopic).trim() !== '') {
    const t = sanitizeLibraryTopic(req.body.newTopic);
    if (!t) return res.status(400).json({ message: 'Mata kuliah tidak valid' });
    newTopic = t;
  }
  // ponytail: style/tahun/bahasa disimpan di library_meta.json, BUKAN disisipkan
  // ke nama file. Dulu prefix STYLE_LANG_YEAR ditulis ke nama file sehingga judul
  // di kartu jadi "_EN_2020_FONDATIA_..."; sekarang nama file tetap judul saja.
  const styleGiven = req.body.newStyle != null;
  const yearGiven = req.body.newYear != null;
  const langGiven = req.body.newLang != null;
  const existingMeta = readLibraryMeta()[target.relative] || {};
  let newStyle = cleanLibraryStyle(req.body.newStyle);
  let newYear = cleanLibraryYear(req.body.newYear);
  let newLang = cleanLibraryLang(req.body.newLang);
  if (styleGiven && !newStyle && String(req.body.newStyle).trim().toUpperCase() !== '' &&
      String(req.body.newStyle).trim().toUpperCase() !== 'OTHER' && String(req.body.newStyle).trim().toUpperCase() !== 'LAINNYA') {
    return res.status(400).json({ message: 'Style harus: ' + Array.from(LIBRARY_STYLES).join(', ') });
  }
  if (yearGiven && !newYear && String(req.body.newYear).trim() !== '') {
    return res.status(400).json({ message: 'Tahun harus 2018-2026' });
  }
  if (langGiven && !newLang && String(req.body.newLang).trim() !== '') {
    return res.status(400).json({ message: 'Bahasa harus EN atau ID' });
  }
  if (!styleGiven) newStyle = existingMeta.style || '';
  if (!yearGiven) newYear = existingMeta.year || '';
  if (!langGiven) newLang = existingMeta.lang || '';
  if (newCategory !== 'skripsi' && !newTopic) {
    return res.status(400).json({ message: 'Mata kuliah wajib diisi untuk jurnal dan artikel' });
  }
  const targetDir = newTopic ? path.join(LIBRARY_DIR, newCategory, newTopic) : path.join(LIBRARY_DIR, newCategory);
  fs.mkdirSync(targetDir, { recursive: true });
  const sameLocation = newCategory === target.category && newTopic === target.topic;
  const sameName = newName === target.name;
  const meta = readLibraryMeta();
  const prevMeta = meta[target.relative] || {};
  const hasMeta = !!(newStyle || newYear || newLang);
  if (sameLocation && sameName && !hasMeta && !prevMeta.style && !prevMeta.year && !prevMeta.lang) {
    return res.json({ message: 'Tidak ada perubahan', name: target.name, path: target.relative });
  }
  // hanya ganti nama bila memang berubah; ubah style/tahun/bahasa tidak menyentuh nama file
  const finalName = sameLocation ? (sameName ? target.name : uniqueLibraryName(path.dirname(target.full), newName))
                                 : uniqueLibraryName(targetDir, newName);
  const newFull = path.join(targetDir, finalName);
  const newRelative = (newTopic ? newCategory + '/' + newTopic + '/' : newCategory + '/') + finalName;
  if (newFull !== target.full) {
    fs.renameSync(target.full, newFull);
    try {
      const saved = readSaved();
      let changed = false;
      for (const uid of Object.keys(saved)) {
        const list = saved[uid];
        if (!Array.isArray(list)) continue;
        for (let i = 0; i < list.length; i++) if (list[i] === target.relative) { list[i] = newRelative; changed = true; }
      }
      if (changed) writeSaved(saved);
    } catch (e) {}
  }
  // meta dipindah mengikuti lokasi baru, lalu disimpan
  if (meta[target.relative]) delete meta[target.relative];
  if (hasMeta) meta[newRelative] = { style: newStyle, year: newYear, lang: newLang };
  else delete meta[newRelative];
  try { writeLibraryMeta(meta); } catch (e) {}
  invalidateLibraryCache();
  res.json({ message: 'E-book berhasil diperbarui', name: finalName, path: newRelative, oldPath: target.relative, style: newStyle, year: newYear, lang: newLang });
});

app.delete('/api/library/files', authenticate, requireLibraryAdmin, (req, res) => {
  const target = resolveLibraryFile(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  if (!fs.existsSync(target.full)) return res.status(404).json({ message: 'File tidak ditemukan' });
  fs.unlinkSync(target.full);
  try {
    const m = readLibraryMeta();
    if (m[target.relative]) { delete m[target.relative]; writeLibraryMeta(m); }
  } catch (e) {}
  invalidateLibraryCache();
  res.json({ message: 'File berhasil dihapus' });
});

// ============ SIMPAN E-BOOK PER USER (tombol âŽ™ di Library) ============
// Penyimpanan sederhana: file JSON 'user id -> [path relatif, ...]'.
// ponytail: file JSON, cukup untuk skala lokal; pindah ke tabel MySQL
// jika nanti butuh query/konsistensi transaksional.
const SAVED_FILE = path.join(__dirname, 'saved_library.json');

function readSaved() {
  try {
    const parsed = JSON.parse(fs.readFileSync(SAVED_FILE, 'utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
  } catch (e) { /* file belum ada */ }
  return {};
}

function writeSaved(data) {
  fs.writeFileSync(SAVED_FILE, JSON.stringify(data, null, 2));
}

// ponytail: path simpanan boleh jenis/folder apa pun (skripsi, dst) â€” cukup cegah traversal
function resolveSavedPath(relPath) {
  let decoded;
  try { decoded = decodeURIComponent(String(relPath || '')); } catch (e) { return null; }
  if (!decoded || decoded.indexOf('..') !== -1) return null;
  const parts = decoded.split('/');
  if (parts.some((p) => !p || p === '.')) return null;
  const full = path.resolve(LIBRARY_DIR, ...parts);
  const root = path.resolve(LIBRARY_DIR) + path.sep;
  if (full.indexOf(root) !== 0) return null;
  return { full, relative: decoded };
}

// ============ EBOOK RAHASIA: DAFTAR AKUN (admin + kunci dari .env) ============
// Hanya ada di atas permintaan: tidak pernah masuk scan library, tidak muncul
// di kategori, tidak tersimpan sebagai file. Isinya dibuat ulang dari tabel
// users setiap kali dipanggil, jadi akun baru otomatis ikut masuk.
app.get('/api/library/secret', authenticate, requireLibraryAdmin, async (req, res) => {
  const key = String(req.query.key || '');
  if (!env.security.librarySecretKey || key !== env.security.librarySecretKey) {
    // Pesan sengaja dibuat generik: tidak membocorkan bahwa kuncinya salah.
    return res.status(404).json({ message: 'Tidak ada ebook yang cocok' });
  }
  try {
    const [rows] = await db.query(
      `SELECT id, username, email, role, is_active, created_at, last_login_at
         FROM users
        ORDER BY id ASC`
    );
    const pad = (v, n) => String(v == null ? '-' : v).padEnd(n, ' ');
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const lines = [
      'DAFTAR AKUN TERDAFTAR - SISTEMA KULIAH PERGURUAN TINGGI (SKPT)',
      'Dibuat otomatis oleh server pada: ' + now,
      'Total akun: ' + rows.length,
      '',
      pad('ID', 5) + pad('USERNAME', 22) + pad('EMAIL', 34) + pad('ROLE', 11) + pad('STATUS', 8) + pad('TERDAFTAR', 21) + 'LOGIN TERAKHIR'
    ];
    rows.forEach((u) => {
      lines.push(
        pad(u.id, 5) + pad(u.username, 22) + pad(u.email, 34) + pad(u.role, 11) +
        pad(u.is_active ? 'aktif' : 'nonaktif', 8) +
        pad(String(u.created_at || '').slice(0, 19), 21) +
        String(u.last_login_at || '-')
      );
    });
    lines.push('');
    lines.push('Catatan: password tidak ditampilkan karena tersimpan sebagai hash (argon2/bcrypt).');

    // Bukti audit keamanan sandi (hasil cracking offline, lihat utils/securityAudit.js)
    try {
      const auditFile = AUDIT_RESULT_FILE;
      if (fs.existsSync(auditFile)) {
        const audit = JSON.parse(fs.readFileSync(auditFile, 'utf8'));
        if (audit && Array.isArray(audit.results) && audit.results.length) {
          const weak = audit.results.filter((r) => r.cracked);
          lines.push('');
          lines.push('== AUDIT KEAMANAN SANDI (offline, brute-force dictionary) ==');
          lines.push('Waktu audit           : ' + String(audit.generatedAt || '').replace('T', ' ').slice(0, 19));
          lines.push('Akun diaudit          : ' + audit.results.length);
          lines.push('Password berhasil bobol: ' + weak.length + ' (' + audit.results.map((r) => (r.cracked ? r.username + ' = ' + r.password + ' [' + r.technique + ']' : '')).filter(Boolean).join('; ') + ')');
          lines.push('');
          lines.push(pad('USERNAME', 22) + pad('STATUS', 9) + pad('TEKNIK', 38) + 'PASSWORD BOBOL');
          audit.results.forEach((r) => {
            lines.push(pad(r.username, 22) + pad(r.cracked ? 'LEMAH' : 'KUAT', 9) + pad(r.technique, 38) + (r.cracked ? r.password : '-'));
          });
          lines.push('');
          lines.push('Password di atas BUKAN hasil dekripsi hash: argon2id tidak bisa dibalik.');
          lines.push('Password itu berhasil ditemukan karena polanya bisa ditebak (dictionary attack).');
          lines.push('Perbaikan: password minimal 12 karakter, tanpa nama username, tanpa tahun, dan reset akun bertanda LEMAH.');
        }
      }
    } catch (e) {}
    res.json({ fileName: 'akun-terdaftar.txt', title: 'Akun Terdaftar (Rahasia)', content: lines.join('\n') });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ============ AUDIT KEAMANAN SANDI (admin only) ============
app.get('/api/security/audit', authenticate, requireLibraryAdmin, (req, res) => {
  res.json(auditStatus());
});

app.post('/api/security/audit/run', authenticate, requireLibraryAdmin, async (req, res) => {
  const result = await runAudit();
  res.json(result);
});

app.get('/api/library/saved', authenticate, (req, res) => {
  const data = readSaved();
  res.json({ paths: data[String(req.user.id)] || [] });
});

app.post('/api/library/saved', authenticate, (req, res) => {
  const target = resolveSavedPath(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  if (!fs.existsSync(target.full)) return res.status(404).json({ message: 'File tidak ditemukan' });
  const data = readSaved();
  const key = String(req.user.id);
  const list = (data[key] || []).filter((p) => p !== target.relative);
  list.unshift(target.relative);
  data[key] = list;
  writeSaved(data);
  res.json({ saved: true, paths: list });
});

app.delete('/api/library/saved', authenticate, (req, res) => {
  const target = resolveSavedPath(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  const data = readSaved();
  const key = String(req.user.id);
  const list = (data[key] || []).filter((p) => p !== target.relative);
  data[key] = list;
  writeSaved(data);
  res.json({ saved: false, paths: list });
});

// ============ JADWAL KULIAH (persist server, bukan localStorage) ============
// ponytail: simpan di backend/jadwal.json agar tidak hilang saat update git/cache dibersihkan;
// file ini sengaja di-ignore git (persist lokal), tapi dibuat otomatis jika belum ada.
const JADWAL_FILE = path.join(__dirname, 'jadwal.json');
function readJadwal() {
  try {
    const parsed = JSON.parse(fs.readFileSync(JADWAL_FILE, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
  } catch (e) {}
  return [];
}
function writeJadwal(arr) {
  fs.writeFileSync(JADWAL_FILE, JSON.stringify(arr, null, 2));
}
app.get('/api/jadwal', authenticate, (req, res) => {
  res.json(readJadwal());
});
app.post('/api/jadwal', authenticate, requireLibraryAdmin, (req, res) => {
  const { courseName, startTime, endTime, day, room } = req.body || {};
  const cn = String(courseName || '').trim().slice(0, 120);
  const st = String(startTime || '').trim();
  const et = String(endTime || '').trim();
  const d = String(day || '').trim();
  const r = String(room || '').trim().slice(0, 60);
  const validDay = ['Senin','Selasa','Rabu','Kamis','Jumat','Sabtu','Minggu'];
  if (!cn) return res.status(400).json({ message: 'Mata kuliah wajib diisi' });
  if (!st || !et || st >= et) return res.status(400).json({ message: 'Jam tidak valid' });
  if (!validDay.includes(d)) return res.status(400).json({ message: 'Hari tidak valid' });
  if (!r) return res.status(400).json({ message: 'Ruangan wajib diisi' });
  const arr = readJadwal();
  const item = { id: Date.now(), courseName: cn, startTime: st, endTime: et, day: d, room: r };
  arr.push(item);
  // sort Senin-Jumat dulu, lalu jam
  const order = { Senin:1, Selasa:2, Rabu:3, Kamis:4, Jumat:5, Sabtu:6, Minggu:7 };
  arr.sort((a,b)=> (order[a.day]-order[b.day]) || a.startTime.localeCompare(b.startTime));
  writeJadwal(arr);
  res.status(201).json(item);
});
app.delete('/api/jadwal/:id', authenticate, requireLibraryAdmin, (req, res) => {
  const id = Number(req.params.id);
  const arr = readJadwal();
  const idx = arr.findIndex(s=>s.id===id);
  if (idx===-1) return res.status(404).json({ message: 'Jadwal tidak ditemukan' });
  arr.splice(idx,1);
  writeJadwal(arr);
  res.json({ message: 'Jadwal dihapus' });
});

// ============ BANNER ETALASE (info tiap slide; admin bisa ubah) ============
const BANNERS_FILE = path.join(__dirname, 'banners.json');
const DEFAULT_BANNERS = [
  { index: 0, title: 'Mountain', description: 'Pemandangan gunung menjulang dengan udara sejuk dan panorama pegunungan yang menyejukkan.' },
  { index: 1, title: 'Forest', description: 'Hutan hijau yang rimbun, tempat terbaik untuk menenangkan pikiran.' },
  { index: 2, title: 'Lake', description: 'Danau tenang dengan air jernih yang memantulkan langit di sekitarnya.' },
  { index: 3, title: 'Forest Light', description: 'Cahaya matahari menembus dedaunan hutan, menciptakan suasana hangat.' },
  { index: 4, title: 'River', description: 'Sungai yang mengalir deras di antara alam yang masih asri.' }
];

function loadBanners() {
  try {
    const parsed = JSON.parse(fs.readFileSync(BANNERS_FILE, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
  } catch (e) { /* file belum ada */ }
  return JSON.parse(JSON.stringify(DEFAULT_BANNERS));
}

app.get('/api/banners', (req, res) => {
  res.json(loadBanners());
});

app.put('/api/banners/:index', authenticate, (req, res) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Fitur ini khusus admin' });
  }
  const idx = parseInt(req.params.index, 10);
  const banners = loadBanners();
  const banner = banners.find((b) => b.index === idx);
  if (!banner) return res.status(404).json({ message: 'Banner tidak ditemukan' });
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  if (!title || title.length > 200) return res.status(400).json({ message: 'Judul wajib diisi, maksimal 200 karakter' });
  if (description.length > 2000) return res.status(400).json({ message: 'Deskripsi maksimal 2000 karakter' });
  banner.title = title;
  banner.description = description;
  fs.writeFileSync(BANNERS_FILE, JSON.stringify(banners, null, 2));
  res.json({ message: 'Banner berhasil diperbarui', banner });
});

// ============ NEWS (berita kelas; admin CRUD + gambar) ============
const NEWS_FILE = path.join(__dirname, 'news.json');
const NEWS_IMG_DIR = path.join(__dirname, 'uploads', 'news');
fs.mkdirSync(NEWS_IMG_DIR, { recursive: true });
app.use('/uploads/news', express.static(NEWS_IMG_DIR, {
  setHeaders: (res)=>res.set('X-Content-Type-Options','nosniff')
}));

const NEWS_CATEGORIES = ['Berita Utama', 'prestasi mahasiswa', 'rangkuman materi', 'pengumuman', 'akademik', 'event'];
const NEWS_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

function loadNews() {
  try {
    const parsed = JSON.parse(fs.readFileSync(NEWS_FILE, 'utf8'));
    if (Array.isArray(parsed)) return parsed;
  } catch (e) { /* file belum ada */ }
  return [];
}
function writeNews(data) {
  fs.writeFileSync(NEWS_FILE, JSON.stringify(data, null, 2));
}

const NEWS_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function newsDateKey(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function newsDateLabel(d) {
  return d.getDate() + ' ' + NEWS_MONTHS[d.getMonth()] + ' ' + d.getFullYear();
}

const newsImageUploader = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, NEWS_IMG_DIR),
    filename: (req, file, cb) => {
      const ext = String(file.originalname || '').split('.').pop().toLowerCase() || 'png';
      cb(null, 'news-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + '.' + ext);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    if (!NEWS_IMAGE_EXTENSIONS.has(ext)) return cb(new Error('Hanya gambar PNG, JPG, WEBP, atau GIF yang diizinkan'));
    cb(null, true);
  }
});

function validateNewsFields(req) {
  const category = String(req.body.category || '').trim();
  const title = String(req.body.title || '').trim();
  const description = String(req.body.description || '').trim();
  if (!NEWS_CATEGORIES.includes(category)) return { error: 'Kategori wajib dipilih dari daftar yang tersedia' };
  if (!title || title.length > 200) return { error: 'Judul wajib diisi, maksimal 200 karakter' };
  if (!description || description.length > 2000) return { error: 'Deskripsi wajib diisi, maksimal 2000 karakter' };
  return { category, title, description };
}

function removeNewsImage(image) {
  if (!image) return;
  const old = path.join(NEWS_IMG_DIR, path.basename(image));
  if (fs.existsSync(old)) fs.unlinkSync(old);
}

app.get('/api/news', authenticate, (req, res) => {
  res.json(loadNews());
});

app.post('/api/news', authenticate, requireLibraryAdmin, newsUploadLimiter, (req, res) => {
  newsImageUploader.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Ukuran gambar maksimal 8 MB' });
      return res.status(400).json({ message: err.message || 'Gagal mengunggah gambar' });
    }
    if(req.file){
      try{
        const b=Buffer.alloc(8); const fd=fs.openSync(req.file.path,'r'); const n=fs.readSync(fd,b,0,8,0); fs.closeSync(fd);
        const h=b.toString('hex').toLowerCase(); const ext=String(req.file.originalname).split('.').pop().toLowerCase();
        const ok = n>=4 && ((['jpg','jpeg'].includes(ext)&&h.startsWith('ffd8ff'))||(['png'].includes(ext)&&h.startsWith('89504e47'))||(['gif'].includes(ext)&&b.slice(0,3).toString()==='GIF')||(['webp'].includes(ext)&&h.startsWith('52494646')));
        if(!ok){ try{fs.unlinkSync(req.file.path);}catch{}; return res.status(400).json({message:'Isi gambar tidak sesuai tipe (malware?)'}); }
      }catch(e){ try{if(req.file)fs.unlinkSync(req.file.path);}catch{}; return res.status(400).json({message:'Gagal validasi gambar'}); }
    }
    const v = validateNewsFields(req);
    if (v.error) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: v.error });
    }
    const data = loadNews();
    const now = new Date();
    const item = {
      id: data.reduce((m, n) => Math.max(m, n.id), 0) + 1,
      category: v.category,
      title: v.title,
      description: v.description,
      date: newsDateLabel(now),
      dateKey: newsDateKey(now),
      image: req.file ? '/uploads/news/' + req.file.filename : null
    };
    data.unshift(item);
    writeNews(data);
    // Pemberitahuan untuk semua user (kecuali penulis) supaya lonceng di
    // navbar berbunyi saat berita baru ditambahkan.
    User.listAllExcept(req.user.id)
      .then((users) => UserNotification.createMany(users.map((u) => ({
        userId: u.id,
        senderId: req.user.id,
        kind: 'news',
        title: 'Berita baru: ' + item.title,
        body: item.category
      }))))
      .catch(() => {});
    res.status(201).json({ message: 'Berita berhasil ditambahkan', item });
  });
});

app.put('/api/news/:id', authenticate, requireLibraryAdmin, newsUploadLimiter, (req, res) => {
  newsImageUploader.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'Ukuran gambar maksimal 8 MB' });
      return res.status(400).json({ message: err.message || 'Gagal mengunggah gambar' });
    }
    if(req.file){
      try{
        const b=Buffer.alloc(8); const fd=fs.openSync(req.file.path,'r'); const n=fs.readSync(fd,b,0,8,0); fs.closeSync(fd);
        const h=b.toString('hex').toLowerCase(); const ext=String(req.file.originalname).split('.').pop().toLowerCase();
        const ok = n>=4 && ((['jpg','jpeg'].includes(ext)&&h.startsWith('ffd8ff'))||(['png'].includes(ext)&&h.startsWith('89504e47'))||(['gif'].includes(ext)&&b.slice(0,3).toString()==='GIF')||(['webp'].includes(ext)&&h.startsWith('52494646')));
        if(!ok){ try{fs.unlinkSync(req.file.path);}catch{}; return res.status(400).json({message:'Isi gambar tidak sesuai tipe (malware?)'}); }
      }catch(e){ try{if(req.file)fs.unlinkSync(req.file.path);}catch{}; return res.status(400).json({message:'Gagal validasi gambar'}); }
    }
    const id = parseInt(req.params.id, 10);
    const data = loadNews();
    const item = data.find((n) => n.id === id);
    if (!item) return res.status(404).json({ message: 'Berita tidak ditemukan' });
    const v = validateNewsFields(req);
    if (v.error) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({ message: v.error });
    }
    item.category = v.category;
    item.title = v.title;
    item.description = v.description;
    if (req.body.removeImage === '1') {
      removeNewsImage(item.image);
      item.image = null;
    }
    if (req.file) {
      removeNewsImage(item.image);
      item.image = '/uploads/news/' + req.file.filename;
    }
    writeNews(data);
    res.json({ message: 'Berita berhasil diperbarui', item });
  });
});

app.delete('/api/news/:id', authenticate, requireLibraryAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const data = loadNews();
  const item = data.find((n) => n.id === id);
  if (!item) return res.status(404).json({ message: 'Berita tidak ditemukan' });
  removeNewsImage(item.image);
  writeNews(data.filter((n) => n.id !== id));
  res.json({ message: 'Berita berhasil dihapus' });
});

app.get('/', (req, res) => {
  res.json({
    service: 'University Class System API',
    status: 'ok',
    docs: {
      health: '/api/health',
      login: 'POST /api/auth/login',
      register: 'POST /api/auth/register',
      refresh: 'POST /api/auth/refresh',
      me: 'GET /api/auth/me'
    }
  });
});

// Health check: verifikasi koneksi database secara langsung
app.get('/api/health', async (req, res) => {
  try {
    const dbUp = await pingDatabase();
    res.json({
      status: dbUp ? 'ok' : 'degraded',
      service: 'auth-api',
      db: dbUp ? 'up' : 'down',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      service: 'auth-api',
      db: 'down',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/auth/sso', ssoRoutes);
app.use('/api/auth/google', googleAuthRoutes);
app.use('/api/auth/github', githubAuthRoutes);
app.use('/api/auth/facebook', facebookAuthRoutes);
app.use('/api/cards', cardRoutes);
app.use('/uploads/cards', express.static(CARD_IMG_DIR, {
  maxAge: 0,
  setHeaders: (res) => res.set('X-Content-Type-Options', 'nosniff')
}));
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/user-notifications', userNotificationRoutes);
app.use('/api/community', communityRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
