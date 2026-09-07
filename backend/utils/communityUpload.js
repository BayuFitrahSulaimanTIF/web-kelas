// ===================================================
// KONFIGURASI UPLOAD COMMUNITY (gambar, voice note, file)
// ===================================================

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const MAX_MEDIA_BYTES = 1024 * 1024 * 1024; // 1 GB

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);
const VOICE_EXTENSIONS = new Set(['webm', 'ogg', 'oga', 'mp3', 'm4a', 'mp4', 'wav']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v', '3gp', '3gpp', 'flv', 'wmv', 'mpg', 'mpeg']);

const communityDir = path.resolve(__dirname, '..', 'uploads', 'community');
fs.mkdirSync(communityDir, { recursive: true });

function getExtension(filename) {
  const parts = String(filename || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

const storage = multer.diskStorage({
  destination: communityDir,
  filename: (req, file, cb) => {
    const ext = getExtension(file.originalname);
    cb(null, Date.now() + '-' + crypto.randomUUID() + '.' + (ext || 'bin'));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_MEDIA_BYTES },
  fileFilter: (req, file, cb) => {
    cb(null, true);
  }
});

const uploadSingle = upload.single('file');

function mediaPath(filename) {
  return path.join(communityDir, path.basename(filename || ''));
}

function cleanupFile(filename) {
  fs.unlink(mediaPath(filename), () => {});
}

function isValidImageMagic(filePath, ext){
  try{
    const buf = Buffer.alloc(8);
    const fd = fs.openSync(filePath,'r');
    const n = fs.readSync(fd, buf, 0, 8, 0);
    fs.closeSync(fd);
    if(n<4) return false;
    const h = buf.toString('hex').toLowerCase();
    if(['jpg','jpeg'].includes(ext)) return h.startsWith('ffd8ff');
    if(['png'].includes(ext)) return h.startsWith('89504e47');
    if(['gif'].includes(ext)) return buf.slice(0,3).toString()==='GIF';
    if(['webp'].includes(ext)) return h.startsWith('52494646');
    if(['bmp'].includes(ext)) return buf.slice(0,2).toString()==='BM';
    return true;
  }catch{ return false; }
}
function handleCommunityMedia(req, res, next) {
  uploadSingle(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Ukuran file melebihi batas maksimal 1 GB' });
      }
      return res.status(400).json({ message: err.message || 'Gagal mengunggah media' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'File wajib diunggah' });
    }

    const ext = getExtension(req.file.originalname);
    const mediaType = String(req.body.type || '').toLowerCase();

    if (mediaType === 'image' && !IMAGE_EXTENSIONS.has(ext)) {
      cleanupFile(req.file.filename);
      return res.status(400).json({ message: 'Format gambar tidak valid (jpg/png/gif/webp/bmp)' });
    }
    if (mediaType === 'voice' && !VOICE_EXTENSIONS.has(ext)) {
      cleanupFile(req.file.filename);
      return res.status(400).json({ message: 'Format suara tidak valid (webm/ogg/m4a/mp3/wav)' });
    }
    if (mediaType === 'video' && !VIDEO_EXTENSIONS.has(ext)) {
      cleanupFile(req.file.filename);
      return res.status(400).json({ message: 'Format video tidak valid (mp4/webm/ogg/mov/avi/mkv)' });
    }
    if (mediaType !== 'image' && mediaType !== 'voice' && mediaType !== 'file' && mediaType !== 'video') {
      cleanupFile(req.file.filename);
      return res.status(400).json({ message: 'Tipe media harus image, voice, video, atau file' });
    }
    if (mediaType === 'image' && !isValidImageMagic(mediaPath(req.file.filename), ext)) {
      cleanupFile(req.file.filename);
      return res.status(400).json({ message: 'Isi gambar tidak sesuai tipe file (kemungkinan malware/palsu)' });
    }

    next();
  });
}

module.exports = {
  MAX_MEDIA_BYTES,
  IMAGE_EXTENSIONS,
  VOICE_EXTENSIONS,
  VIDEO_EXTENSIONS,
  communityDir,
  getExtension,
  handleCommunityMedia,
  mediaPath
};
