// ===================================================
// ROUTE CARD CAROUSEL BERANDA
// GET  /api/cards            -> semua pengguna login bisa membaca
// GET  /api/cards/whoami     -> apakah saya boleh mengedit
// PUT  /api/cards/:slot      -> ubah judul + deskripsi (editor saja)
// POST /api/cards/:slot/image-> unggah gambar (editor saja)
// DELETE /api/cards/:slot/image -> hapus gambar (editor saja)
// ===================================================

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const asyncHandler = require('../middlewares/asyncHandler');
const authenticate = require('../middlewares/authenticate');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const { AppError } = require('../utils/errors');
const {
  CARD_IMG_DIR, CARD_COUNT, EDITOR_USERNAME, EDITOR_MESSAGE,
  loadCards, saveCard, removeCardImage
} = require('../utils/cardsStore');

const router = express.Router();

const MAX_BYTES = 6 * 1024 * 1024;
const EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

const cardUploader = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, CARD_IMG_DIR),
    filename: (req, file, cb) => {
      const ext = String(file.originalname || '').split('.').pop().toLowerCase();
      cb(null, 'card-' + req.params.slot + '-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex') + '.' + ext);
    }
  }),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (req, file, cb) => {
    const ext = String(file.originalname || '').split('.').pop().toLowerCase();
    if (!EXTENSIONS.has(ext)) return cb(new Error('Hanya gambar PNG, JPG, WEBP, atau GIF yang diizinkan'));
    cb(null, true);
  }
});

// Cek byte ajaib: nama ekstensi bisa dipalsukan.
function looksLikeImage(file) {
  const fd = fs.openSync(file.path, 'r');
  try {
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return true;
    if (buf.slice(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return true;
    if (buf.slice(0, 3).toString('latin1') === 'GIF') return true;
    if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return true;
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

function slot(req) {
  const n = Number(req.params.slot);
  if (!Number.isInteger(n) || n < 1 || n > CARD_COUNT) {
    throw new AppError(404, 'Kartu tidak ditemukan');
  }
  return n;
}

// Satu-satunya penjaga: admin DAN username yang tepat.
function requireCardsEditor(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Fitur ini khusus admin' });
  }
  if (req.user.username !== EDITOR_USERNAME) {
    return res.status(403).json({ message: EDITOR_MESSAGE });
  }
  next();
}

const uploadLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, name: 'card-upload' });

// ---------- baca ----------
router.get('/whoami', authenticate, (req, res) => {
  res.json({
    editor: req.user.role === 'admin' && req.user.username === EDITOR_USERNAME,
    username: req.user.username
  });
});

router.get('/', authenticate, (req, res) => {
  res.json({ cards: loadCards() });
});

// ---------- ubah (editor saja) ----------
router.put('/:slot', authenticate, requireCardsEditor, asyncHandler(async (req, res) => {
  const s = slot(req);
  const body = req.body || {};
  const patch = {};

  if (typeof body.title === 'string') patch.title = body.title.trim();
  if (typeof body.description === 'string') patch.description = body.description.trim();

  if (Object.keys(patch).length === 0) {
    throw new AppError(400, 'Tidak ada yang diubah');
  }

  const card = saveCard(s, patch);
  res.json({ message: 'Kartu ' + s + ' diperbarui', card });
}));

router.post('/:slot/image', authenticate, requireCardsEditor, uploadLimiter, (req, res) => {
  const s = slot(req);

  cardUploader.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Ukuran gambar maksimal 6 MB' });
      }
      return res.status(400).json({ message: err.message || 'Gagal menerima gambar' });
    }
    if (!req.file) return res.status(400).json({ message: 'File gambar wajib diunggah' });

    if (!looksLikeImage(req.file)) {
      try { fs.unlinkSync(req.file.path); } catch (e) {}
      return res.status(400).json({ message: 'File itu bukan gambar yang sah' });
    }

    removeCardImage(s);
    const url = '/uploads/cards/' + encodeURIComponent(req.file.filename);
    const card = saveCard(s, { image: url });
    res.json({ message: 'Gambar kartu ' + s + ' disimpan', card });
  });
});

router.delete('/:slot/image', authenticate, requireCardsEditor, asyncHandler(async (req, res) => {
  const s = slot(req);
  removeCardImage(s);
  const card = saveCard(s, { image: null });
  res.json({ message: 'Gambar kartu ' + s + ' dihapus', card });
}));

module.exports = router;