// ===================================================
// CONTROLLER FILE KELAS
// Upload / daftar / buka / unduh / hapus materi & project
// ===================================================

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');
const ClassFile = require('../models/ClassFile');
const { AppError } = require('../utils/errors');
const { MAX_TOTAL_BYTES, KELAS_PATTERN, uploadDirs, getExtension } = require('../utils/upload');

// ponytail: tugas/uts/uas/project dipisah per akun — hanya pemilik yang lihat
const PRIVATE_KINDS = new Set(['tugas', 'uts', 'uas', 'project']);

function normalizeKelas(value) {
  const kelas = String(value || '').trim().toUpperCase();
  if (!KELAS_PATTERN.test(kelas)) {
    throw new AppError(400, 'Kelas harus berupa A sampai L');
  }
  return kelas;
}

function resolveFilePath(kind, file) {
  const baseName = path.basename(file.filename);
  return path.join(uploadDirs[kind], baseName);
}

// Hanya tipe yang aman ditampilkan inline di browser.
// Jenis lain dipaksa unduh (attachment) agar file .html/.js/.svg
// dari mahasiswa tidak dieksekusi di origin aplikasi (stored XSS).
const INLINE_SAFE_EXTENSIONS = new Set(['pdf', 'mp4', 'jpg', 'jpeg', 'png', 'gif', 'webp']);

// MIME ditentukan dari ekstensi di sisi server; MIME bawaan klien
// TIDAK dipercaya (bisa spoof "text/html" untuk menyuntik skrip).
const MIME_BY_EXTENSION = {
  pdf: 'application/pdf',
  mp4: 'video/mp4',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp'
};

function streamFile(kind, idParam, attachment) {
  return asyncHandler(async (req, res) => {
    const file = await ClassFile.findById(kind, req.params[idParam]);
    if (!file) {
      throw new AppError(404, 'File tidak ditemukan');
    }
    if (PRIVATE_KINDS.has(kind) && file.uploaded_by !== req.user.id) {
      throw new AppError(403, 'Anda tidak berhak mengakses file ini');
    }

    const filePath = resolveFilePath(kind, file);

    if (!fs.existsSync(filePath)) {
      throw new AppError(404, 'File fisik tidak ditemukan di server');
    }

    const ext = getExtension(file.filename) || getExtension(file.original_name);
    const forceDownload = attachment || !INLINE_SAFE_EXTENSIONS.has(ext);

    const safeName = file.original_name.replace(/"/g, "'");
    res.setHeader('Content-Type', MIME_BY_EXTENSION[ext] || 'application/octet-stream');
    res.setHeader('Content-Length', file.size);
    res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'inline'}; filename="${safeName}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');

    fs.createReadStream(filePath).pipe(res);
  });
}

// ===================================================
// UPLOAD (multer sudah menjalankan validasi ekstensi/ukuran)
// ===================================================

async function saveUploads(kind, req, res, withDescription) {
  const kelas = normalizeKelas(req.body.kelas);
  const description = withDescription ? String(req.body.description || '').trim().slice(0, 2000) : null;

  if (withDescription && !description) {
    req.files.forEach((f) => fs.unlink(resolveFilePath(kind, f), () => {}));
    throw new AppError(422, 'Deskripsi materi wajib diisi');
  }

  const files = req.files;
  const totalNew = files.reduce((sum, f) => sum + f.size, 0);
  const totalSize = PRIVATE_KINDS.has(kind)
    ? await ClassFile.sumSizeByKelasAndUser(kind, kelas, req.user.id)
    : await ClassFile.sumSizeByKelas(kind, kelas);
  if (totalSize + totalNew > MAX_TOTAL_BYTES) {
    files.forEach((f) => fs.unlink(resolveFilePath(kind, f), () => {}));
    throw new AppError(413, 'Total penyimpanan kelas ini sudah mencapai batas 1 GB');
  }

  for (const f of files) {
    await ClassFile.create(kind, {
      kelas,
      filename: f.filename,
      originalName: f.original_name,
      mimeType: f.mimetype || 'application/octet-stream',
      size: f.size,
      description,
      uploadedBy: req.user.id
    });
  }

  res.status(201).json({ message: `${files.length} file berhasil diunggah` });
}

exports.uploadMateri = asyncHandler(async (req, res) => {
  await saveUploads('materi', req, res, true);
});

exports.uploadProject = asyncHandler(async (req, res) => {
  await saveUploads('project', req, res, false);
});

// ===================================================
// DAFTAR FILE PER KELAS
// ===================================================

exports.listMateri = asyncHandler(async (req, res) => {
  const kelas = normalizeKelas(req.query.kelas);
  const files = await ClassFile.listByKelas('materi', kelas);
  res.json({ files });
});

exports.listProject = asyncHandler(async (req, res) => {
  const kelas = normalizeKelas(req.query.kelas);
  const files = await ClassFile.listByKelasAndUser('project', kelas, req.user.id);
  res.json({ files });
});

// ====================================================
// TUGAS / UTS / UAS - sama dengan project (semua role)
// ====================================================

function makeList(kind) {
  return asyncHandler(async (req, res) => {
    const kelas = normalizeKelas(req.query.kelas);
    const files = PRIVATE_KINDS.has(kind)
      ? await ClassFile.listByKelasAndUser(kind, kelas, req.user.id)
      : await ClassFile.listByKelas(kind, kelas);
    res.json({ files });
  });
}

function makeUpload(kind) {
  return asyncHandler(async (req, res) => {
    await saveUploads(kind, req, res, false);
  });
}

function makeDelete(kind) {
  return asyncHandler(async (req, res) => {
    await removeFile(kind, req, res, false);
  });
}

exports.listTugas = makeList('tugas');
exports.listUts = makeList('uts');
exports.listUas = makeList('uas');

exports.uploadTugas = makeUpload('tugas');
exports.uploadUts = makeUpload('uts');
exports.uploadUas = makeUpload('uas');

exports.viewTugas = streamFile('tugas', 'id', false);
exports.downloadTugas = streamFile('tugas', 'id', true);
exports.viewUts = streamFile('uts', 'id', false);
exports.downloadUts = streamFile('uts', 'id', true);
exports.viewUas = streamFile('uas', 'id', false);
exports.downloadUas = streamFile('uas', 'id', true);

exports.deleteTugas = makeDelete('tugas');
exports.deleteUts = makeDelete('uts');
exports.deleteUas = makeDelete('uas');

// ===================================================
// BUKA (inline) / UNDUH (attachment)
// ===================================================

exports.viewMateri = streamFile('materi', 'id', false);
exports.downloadMateri = streamFile('materi', 'id', true);
exports.viewProject = streamFile('project', 'id', false);
exports.downloadProject = streamFile('project', 'id', true);

// ===================================================
// HAPUS (materi: admin; project: admin atau pemilik)
// ===================================================

async function removeFile(kind, req, res, requireAdmin) {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'ID file tidak valid');
  }

  const file = await ClassFile.findById(kind, id);
  if (!file) {
    throw new AppError(404, 'File tidak ditemukan');
  }

  const isAdmin = req.user.role === 'admin';
  const isOwner = file.uploaded_by === req.user.id;

  if (PRIVATE_KINDS.has(kind)) {
    if (!isOwner) throw new AppError(403, 'Hanya pemilik yang dapat menghapus file ini');
  } else {
    if (requireAdmin && !isAdmin) {
      throw new AppError(403, 'Fitur ini khusus admin');
    }
    if (!isAdmin && !isOwner) {
      throw new AppError(403, 'Anda tidak berhak menghapus file ini');
    }
  }

  fs.unlink(resolveFilePath(kind, file), () => {});
  await ClassFile.deleteById(kind, id);

  res.json({ message: 'File berhasil dihapus' });
}

exports.deleteMateri = asyncHandler(async (req, res) => {
  await removeFile('materi', req, res, true);
});

exports.deleteProject = asyncHandler(async (req, res) => {
  await removeFile('project', req, res, false);
});
