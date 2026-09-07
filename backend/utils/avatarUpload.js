// ===================================================
// UPLOAD FOTO PROFIL (avatar)
// - Format: .jpg, .jpeg, .png (maksimal 5 MB)
// - Nama file: <userId>-<timestamp>.<ext> (cache buster)
// - File lama dihapus saat diganti
// ===================================================

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const AVATAR_DIR = path.resolve(__dirname, '..', 'uploads', 'avatars');
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_EXTENSIONS = new Set(['jpg', 'jpeg', 'png']);

fs.mkdirSync(AVATAR_DIR, { recursive: true });

function avatarExtension(filename) {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

const avatarUploader = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, AVATAR_DIR),
    filename: (req, file, cb) => {
      const ext = avatarExtension(file.originalname) === 'png' ? 'png' : 'jpg';
      cb(null, req.user.id + '-' + Date.now() + '.' + ext);
    }
  }),
  limits: { fileSize: MAX_AVATAR_BYTES },
  fileFilter: (req, file, cb) => {
    if (!AVATAR_EXTENSIONS.has(avatarExtension(file.originalname))) {
      return cb(new Error('Hanya .jpg, .jpeg, .png yang diizinkan'));
    }
    cb(null, true);
  }
});

module.exports = {
  AVATAR_DIR,
  MAX_AVATAR_BYTES,
  avatarUploader
};
