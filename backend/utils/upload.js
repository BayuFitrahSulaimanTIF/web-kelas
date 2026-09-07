// ===================================================
// KONFIGURASI UPLOAD FILE
// - Materi  : khusus admin, .pdf/.mp4/.pptx/.jpg/.jpeg, 1 GB
// - Project : semua role, .txt/.zip + format kode program, 1 GB
// ===================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024; // 1 GB per file
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 1 GB total per kelas
const KELAS_PATTERN = /^[A-L]$/;

const MATERI_EXTENSIONS = new Set(['pdf', 'mp4', 'pptx', 'jpg', 'jpeg']);
const PROJECT_EXTENSIONS = new Set([
  'txt', 'zip',
  'css', 'py', 'c', 'cs', 'html', 'htm', 'cpp', 'cc', 'cxx',
  'js', 'jsx', 'ts', 'tsx',
  'java', 'php', 'rb', 'go', 'rs', 'swift', 'kt', 'kts',
  'sql', 'sh', 'bash', 'json', 'xml', 'yml', 'yaml', 'md',
  'ini', 'cfg', 'h', 'hpp', 'm', 'pl', 'lua', 'r', 'dart', 'scala', 'groovy',
  'vb', 'vbs', 'fs', 'fsx', 'hs', 'ml', 'mli', 'clj', 'cljs',
  'el', 'ex', 'exs', 'erl', 'hrl', 'elm', 'nim', 'zig', 'v',
  'asm', 's', 'bat', 'cmd', 'ps1', 'psm1', 'jl', 'coffee',
  'd', 'pas', 'pp', 'cob', 'cbl', 'tcl', 'awk', 'vue', 'pug', 'cmake'
]);

const uploadRoot = path.resolve(__dirname, '..', 'uploads');
const uploadDirs = {
  materi: path.join(uploadRoot, 'materi'),
  project: path.join(uploadRoot, 'project'),
  tugas: path.join(uploadRoot, 'tugas'),
  uts: path.join(uploadRoot, 'uts'),
  uas: path.join(uploadRoot, 'uas')
};

for (const dir of Object.values(uploadDirs)) {
  fs.mkdirSync(dir, { recursive: true });
}

function getExtension(filename) {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function sanitizeOriginalName(name) {
  return String(name || '')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200) || 'file';
}

function buildUploader(kind) {
  const allowedExtensions = kind === 'materi' ? MATERI_EXTENSIONS : PROJECT_EXTENSIONS;

  const storage = multer.diskStorage({
    destination: uploadDirs[kind],
    filename: (req, file, cb) => {
      const ext = getExtension(file.originalname);
      cb(null, `${Date.now()}-${crypto.randomUUID()}.${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (req, file, cb) => {
      const ext = getExtension(file.originalname);
      if (!allowedExtensions.has(ext)) {
        const hint = kind === 'materi'
          ? 'Hanya .pdf, .mp4, .pptx, .jpg, .jpeg yang diizinkan'
          : 'Hanya .txt, .zip, dan format kode program (css, py, c, c#, html, cpp, js, dll) yang diizinkan';
        return cb(new Error(hint));
      }
      cb(null, true);
    }
  });

  return upload;
}

// Bungkus middleware multer agar error terjemahkan ke JSON
// Menerima hingga 10 file sekaligus (upload.array)
function handleUpload(upload) {
  return (req, res, next) => {
    upload.array('file', 10)(req, res, (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({ message: 'Ukuran file melebihi batas 1 GB' });
        }
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({ message: 'Maksimal 10 file dalam satu pengiriman' });
        }
        return res.status(400).json({ message: err.message || 'Gagal mengunggah file' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'File wajib diunggah' });
      }

      req.files.forEach((f) => { f.original_name = sanitizeOriginalName(f.originalname); });
      next();
    });
  };
}

module.exports = {
  MAX_UPLOAD_BYTES,
  MAX_TOTAL_BYTES,
  KELAS_PATTERN,
  MATERI_EXTENSIONS,
  PROJECT_EXTENSIONS,
  uploadDirs,
  getExtension,
  buildUploader,
  handleUpload
};
