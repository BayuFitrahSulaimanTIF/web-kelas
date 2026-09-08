// ===================================================
// APP EXPRESS
// ===================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const { env } = require('./config/env');
const { pingDatabase } = require('./config/database');
const authenticate = require('./middlewares/authenticate');
const authRoutes = require('./routes/auth');
const ssoRoutes = require('./routes/sso');
const fileRoutes = require('./routes/files');
const userRoutes = require('./routes/users');
const notificationRoutes = require('./routes/notifications');
const communityRoutes = require('./routes/community');
const requestLogger = require('./middlewares/requestLogger');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');
const { createRateLimiter } = require('./middlewares/rateLimiter');
const libraryUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 10, name: 'library-upload' });
const newsUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 15, name: 'news-upload' });

const app = express();

app.use(requestLogger);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
      connectSrc: ["'self'", "http://localhost:3000", "https://*.lhr.life", "https://*.serveousercontent.com", "https://*.devtunnels.ms", "https://*.asse.devtunnels.ms", "https://*.ngrok-free.dev", "https://*.ngrok-free.app", "https://*.onrender.com", "https://*.up.railway.app", "https://1.1.1.1", "https://connectivitycheck.gstatic.com", "https://www.google.com"],
      frameSrc: ["'self'", "blob:", "data:", "https://view.officeapps.live.com"],
      childSrc: ["'self'", "blob:", "data:"],
      objectSrc: ["'self'", "blob:", "data:"],
      frameAncestors: ["'self'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
const _corsAllow = String(env.corsOrigin || 'http://localhost:3000').split(',').map(s=>s.trim()).filter(Boolean);
const _corsIsAllowed = (origin)=>{
  if(!origin || origin === 'null') return true;
  return _corsAllow.some(p=>{
    if(p==='*') return true;
    if(p.includes('*')){
      const re = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*') + '$');
      return re.test(origin);
    }
    return p===origin;
  });
};
app.use(cors({
  origin: (origin, cb)=>{
    if(_corsIsAllowed(origin)) return cb(null, true);
    return cb(null, false);
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ponytail: wajib internet — jika offline, halaman HTML (/) diblokir dengan
// ponytail: server tetap layani HTML bahkan saat offline — blokir ditangani
// di frontend (connectivity.js) agar tidak false-positive "tidak bisa diakses padahal online"
// (fetch generate_204 di server rawan terblokir firewall/proxy). Cache tetap no-store.


// Statis selalu divalidasi ulang ke server (max-age=0) agar perubahan
// dashboard.html/style.css langsung terlihat tanpa cache tersimpan lama.
app.use(express.static(path.join(__dirname, '..'), { maxAge: 0, etag: true }));

// Dashboard (dashboard.html berada di root yang sama)
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dashboard.html'));
});

// ============ LIBRARY (folder e-book lokal) ============
const { LIBRARY_DIR, walkLibrary } = require('./utils/libraryWalk');

app.use('/library/files', express.static(LIBRARY_DIR, {
  setHeaders: (res, p)=>{
    res.set('X-Content-Type-Options','nosniff');
    const ext = String(p).split('.').pop().toLowerCase();
    if(!['pdf'].includes(ext)) res.set('Content-Disposition','attachment; filename="'+String(p).split('/').pop()+'"');
  }
}));

// Foto profil pengguna (avatar) — akses publik untuk ditampilkan
const { AVATAR_DIR } = require('./utils/avatarUpload');
app.use('/uploads/avatars', express.static(AVATAR_DIR, {
  setHeaders: (res)=>res.set('X-Content-Type-Options','nosniff')
}));

app.get('/api/library/files', (req, res) => {
  try {
    const files = walkLibrary(LIBRARY_DIR, LIBRARY_DIR, []);
    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ UPLOAD KE LIBRARY (kategori jurnal/artikel + mata kuliah) ============
const LIBRARY_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt']);
const MAX_LIBRARY_BYTES = 1024 * 1024 * 1024; // 1 GB per file

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
    const category = String(req.body.category || '');
    const topic = sanitizeLibraryTopic(req.body.topic);
    if (!['jurnal', 'artikel'].includes(category)) {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Kategori wajib diisi: jurnal atau artikel' });
    }
    if (!topic) {
      cleanupLibraryStaging(req);
      return res.status(400).json({ message: 'Mata kuliah wajib diisi' });
    }
    for(const f of req.files){
      const ext = String(f.originalname||f.filename).split('.').pop().toLowerCase();
      const fp = path.join(req.libraryStaging, f.filename);
      if(!isValidLibraryMagic(fp, ext)){ cleanupLibraryStaging(req); return res.status(400).json({ message: `File ${f.originalname} ditolak: isi file tidak sesuai tipe ${ext} (kemungkinan malware/palsu)` }); }
    }

    try {
      const targetDir = path.join(LIBRARY_DIR, category, topic);
      fs.mkdirSync(targetDir, { recursive: true });
      const saved = req.files.map((f) => {
        const finalName = uniqueLibraryName(targetDir, f.filename);
        fs.renameSync(path.join(req.libraryStaging, f.filename), path.join(targetDir, finalName));
        return { relativePath: category + '/' + topic + '/' + finalName, name: finalName, size: f.size };
      });
      cleanupLibraryStaging(req);
      res.json({ files: saved });
    } catch (moveError) {
      cleanupLibraryStaging(req);
      res.status(500).json({ message: 'Gagal menyimpan file: ' + moveError.message });
    }
  });
});

// ============ UBAH NAMA / HAPUS FILE LIBRARY (khusus admin) ============
// Path relatif seperti 'jurnal/basis_data/file.pdf'; hanya mengizinkan
// struktur kategori/topik/nama (tanpa subfolder lain & tanpa '..').
function resolveLibraryFile(relPath) {
  let decoded;
  try { decoded = decodeURIComponent(String(relPath || '')); } catch (e) { return null; }
  const parts = decoded.split('/');
  if (parts.length !== 3) return null;
  const [category, topic, name] = parts;
  if (!['jurnal', 'artikel'].includes(category)) return null;
  if (!topic || topic !== sanitizeLibraryTopic(topic)) return null;
  if (!name || name.indexOf('..') !== -1) return null;
  const full = path.resolve(LIBRARY_DIR, category, topic, name);
  const root = path.resolve(LIBRARY_DIR) + path.sep;
  if (full.indexOf(root) !== 0) return null;
  return { category, topic, name, full, relative: category + '/' + topic + '/' + name };
}

app.patch('/api/library/files', authenticate, requireLibraryAdmin, (req, res) => {
  const target = resolveLibraryFile(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  if (!fs.existsSync(target.full)) return res.status(404).json({ message: 'File tidak ditemukan' });
  // ponytail: edit lengkap — nama boleh tanpa .pdf, kategori & matkul bisa dipindah
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
    if (!['jurnal', 'artikel'].includes(c)) return res.status(400).json({ message: 'Kategori harus jurnal atau artikel' });
    newCategory = c;
  }
  let newTopic = target.topic;
  if (req.body.newTopic != null && String(req.body.newTopic).trim() !== '') {
    const t = sanitizeLibraryTopic(req.body.newTopic);
    if (!t) return res.status(400).json({ message: 'Mata kuliah tidak valid' });
    newTopic = t;
  }
  const targetDir = path.join(LIBRARY_DIR, newCategory, newTopic);
  fs.mkdirSync(targetDir, { recursive: true });
  const sameLocation = newCategory === target.category && newTopic === target.topic;
  if (sameLocation && newName === target.name) {
    return res.json({ message: 'Tidak ada perubahan', name: target.name, path: target.relative });
  }
  let finalName;
  if (sameLocation) finalName = uniqueLibraryName(path.dirname(target.full), newName);
  else finalName = uniqueLibraryName(targetDir, newName);
  const newFull = path.join(targetDir, finalName);
  const newRelative = newCategory + '/' + newTopic + '/' + finalName;
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
  res.json({ message: 'E-book berhasil diperbarui', name: finalName, path: newRelative, oldPath: target.relative });
});

app.delete('/api/library/files', authenticate, requireLibraryAdmin, (req, res) => {
  const target = resolveLibraryFile(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  if (!fs.existsSync(target.full)) return res.status(404).json({ message: 'File tidak ditemukan' });
  fs.unlinkSync(target.full);
  res.json({ message: 'File berhasil dihapus' });
});

// ============ SIMPAN E-BOOK PER USER (tombol ⎙ di Library) ============
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

app.get('/api/library/saved', authenticate, (req, res) => {
  const data = readSaved();
  res.json({ paths: data[String(req.user.id)] || [] });
});

app.post('/api/library/saved', authenticate, (req, res) => {
  const target = resolveLibraryFile(req.body.path);
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
  const target = resolveLibraryFile(req.body.path);
  if (!target) return res.status(400).json({ message: 'Lokasi file tidak valid' });
  const data = readSaved();
  const key = String(req.user.id);
  const list = (data[key] || []).filter((p) => p !== target.relative);
  data[key] = list;
  writeSaved(data);
  res.json({ saved: false, paths: list });
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
app.use('/api/files', fileRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/community', communityRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
