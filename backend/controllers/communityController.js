// ===================================================
// CONTROLLER COMMUNITY (chat ala WhatsApp)
// ===================================================

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../middlewares/asyncHandler');
const CommunityMessage = require('../models/CommunityMessage');
const { handleCommunityMedia, mediaPath } = require('../utils/communityUpload');
const { listLibraryFiles } = require('../utils/libraryWalk');
const { AppError } = require('../utils/errors');

// Parse "/library <judul ebook> <teks bebas>": judul dicocokkan kata-per-kata
// terhadap nama file library (tanpa ekstensi), sehingga teks di belakang judul
// tetap menjadi isi pesan. Cocok = kata sama atau salah satu prefix kata lain
// (file yang dipotong di tengah kata tetap cocok), prefix tahun ("2021_") dan
// underscore dibuang. Contoh:
//   /library Bahtera Indonesia ... MEDIA PEMBELAJARAN saya coba
//   -> file "2021_Bahtera Indonesia ... MEDIA PEMBELAJA.pdf", teks = "saya coba"
function tokenizeTitle(s) {
  return String(s)
    .toLowerCase()
    .replace(/^\d{4}[_\-\s]+/, '')
    .replace(/[_\s]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1);
}

function wordMatch(a, b) {
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function parseLibraryCommand(content) {
  const m = /^\/library\s+(.+)$/i.exec(content);
  if (!m) return null;
  const rest = m[1].trim();
  if (!rest) return null;
  const rWords = tokenizeTitle(rest);
  if (!rWords.length) return null;

  let best = null;
  try {
    const files = listLibraryFiles();
    for (const f of files) {
      const tWords = tokenizeTitle(path.basename(f.name, path.extname(f.name)));
      if (!tWords.length) continue;
      // coba match judul mulai dari tiap posisi kata di rest DAN dari tiap kata
      // judul (user boleh mengetik judul tidak lengkap / mulai dari tengah);
      // ambil run terpanjang.
      let bestMatch = 0;
      for (let start = 0; start < rWords.length; start++) {
        for (let ti = 0; ti < tWords.length; ti++) {
          let matched = 0;
          for (let k = ti; k < tWords.length; k++) {
            const rw = rWords[start + matched];
            if (rw && wordMatch(tWords[k], rw)) matched++;
            else break;
          }
          if (matched > bestMatch) bestMatch = matched;
        }
      }
      if (!bestMatch) continue;
      // judul pendek (<=3 kata) wajib cocok semua; judul panjang cukup >= 1/3
      const need = tWords.length <= 3 ? tWords.length : Math.max(3, Math.ceil(tWords.length / 3));
      if (bestMatch < need) continue;
      if (!best || bestMatch > best.matched || (bestMatch === best.matched && tWords.length > best.titleWords)) {
        best = { relativePath: f.relativePath, name: f.name, matched: bestMatch, titleWords: tWords.length };
      }
    }
  } catch (e) { best = null; }
  if (!best) return null;
  // sisa teks = semua kata rest minus kata-kata yang termakan judul (dicari lagi
  // dengan run terpanjang agar pemotongan akurat di tengah kalimat)
  let cutAt = 0;
  let bestRun = 0;
  const tWords = tokenizeTitle(path.basename(best.name, path.extname(best.name)));
  for (let start = 0; start <= rWords.length; start++) {
    for (let ti = 0; ti < tWords.length; ti++) {
      let matched = 0;
      for (let k = ti; k < tWords.length; k++) {
        const rw = rWords[start + matched];
        if (rw && wordMatch(tWords[k], rw)) matched++;
        else break;
      }
      if (matched > bestRun) { bestRun = matched; cutAt = start + matched; }
    }
  }
  const remainder = rWords.slice(cutAt).join(' ');
  return { libraryRef: best.relativePath, text: remainder };
}

exports.listMessages = asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 30, 100);
  const beforeId = Number(req.query.before);
  const afterId = Number(req.query.after);

  let fetchMessages = async () => {
    if (Number.isInteger(beforeId) && beforeId > 0) {
      return CommunityMessage.listBefore({ beforeId, limit });
    }
    return CommunityMessage.listLatest({ limit, afterId: Number.isInteger(afterId) && afterId > 0 ? afterId : null });
  };

  let messages = await fetchMessages();

  if (messages.length > 0) {
    await CommunityMessage.markRead({ messageIds: messages.map((m) => m.id), userId: req.user.id });
    messages = await fetchMessages();
  }

  const deleted = await CommunityMessage.listDeletedIds();
  res.json({ messages, deleted });
});

exports.sendText = asyncHandler(async (req, res) => {
  const content = String(req.body.content || '').trim().slice(0, 4000);
  const parsed = parseLibraryCommand(content);
  const libraryRef = parsed ? parsed.libraryRef : null;
  const text = parsed ? parsed.text : content;
  if (!text && !libraryRef) {
    throw new AppError(422, 'Isi pesan tidak boleh kosong');
  }

  let replyTo = null;
  if (req.body.reply_to != null && req.body.reply_to !== '') {
    replyTo = Number(req.body.reply_to);
    if (!Number.isInteger(replyTo) || replyTo < 1) {
      throw new AppError(400, 'ID pesan yang dibalas tidak valid');
    }
    const target = await CommunityMessage.findById(replyTo);
    if (!target) {
      throw new AppError(400, 'Pesan yang dibalas tidak ditemukan');
    }
  }

  const id = await CommunityMessage.create({
    userId: req.user.id,
    type: 'text',
    content: text,
    replyTo,
    libraryRef
  });

  const created = await CommunityMessage.findById(id);
  res.status(201).json({ message: 'Pesan terkirim', msg: created });
});

exports.uploadMedia = [
  handleCommunityMedia,
  asyncHandler(async (req, res) => {
    const mediaType = String(req.body.type || '').toLowerCase();
    let replyTo = null;
    if (req.body.reply_to != null && req.body.reply_to !== '') {
      replyTo = Number(req.body.reply_to);
      if (!Number.isInteger(replyTo) || replyTo < 1) {
        fs.unlink(mediaPath(req.file.filename), () => {});
        throw new AppError(400, 'ID pesan yang dibalas tidak valid');
      }
      const target = await CommunityMessage.findById(replyTo);
      if (!target) {
        fs.unlink(mediaPath(req.file.filename), () => {});
        throw new AppError(400, 'Pesan yang dibalas tidak ditemukan');
      }
    }

    const id = await CommunityMessage.create({
      userId: req.user.id,
      type: mediaType,
      content: (mediaType === 'image' || mediaType === 'video') ? String(req.body.content || '').trim().slice(0, 1000) || null : null,
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype || 'application/octet-stream',
      size: req.file.size,
      replyTo
    });

    const created = await CommunityMessage.findById(id);
    res.status(201).json({ message: 'Media terkirim', msg: created });
  })
];

exports.deleteMessage = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'ID pesan tidak valid');
  }

  const msg = await CommunityMessage.findById(id);
  if (!msg) {
    throw new AppError(404, 'Pesan tidak ditemukan');
  }

  if (msg.user_id !== req.user.id && req.user.role !== 'admin') {
    throw new AppError(403, 'Anda hanya dapat menghapus pesan Anda sendiri');
  }

  if (msg.filename) {
    fs.unlink(mediaPath(msg.filename), () => {});
  }

  await CommunityMessage.markDeleted(id);
  await CommunityMessage.deleteById(id);
  res.json({ message: 'Pesan berhasil dihapus' });
});

exports.streamMedia = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'ID pesan tidak valid');
  }

  const msg = await CommunityMessage.findById(id);
  if (!msg || !msg.filename) {
    throw new AppError(404, 'Media tidak ditemukan');
  }

  const filePath = mediaPath(msg.filename);
  if (!fs.existsSync(filePath)) {
    throw new AppError(404, 'File fisik tidak ditemukan di server');
  }

  // Hanya gambar/suara yang aman ditampilkan inline; jenis lain
  // (file .html/.js/.svg dari pengguna) dipaksa unduh (anti stored XSS).
  // MIME ditentukan dari ekstensi di sisi server, bukan bawaan klien.
  const ext = (String(msg.filename || '').split('.').pop() || '').toLowerCase();
  const INLINE_SAFE = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'webm', 'ogg', 'oga', 'mp3', 'm4a', 'mp4', 'wav']);
  const MIME_BY_EXT = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', webm: 'video/webm', ogg: 'audio/ogg',
    oga: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'video/mp4', wav: 'audio/wav'
  };
  const inline = INLINE_SAFE.has(ext);

  res.setHeader('Content-Type', MIME_BY_EXT[ext] || 'application/octet-stream');
  res.setHeader('Content-Length', msg.size);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  if (!inline) {
    res.setHeader('Content-Disposition', 'attachment; filename="media.' + ext + '"');
  } else if (msg.type === 'file' && msg.original_name) {
    res.setHeader('Content-Disposition', "attachment; filename=\"" + msg.original_name.replace(/["\\\r\n]/g, '') + "\"");
  }

  fs.createReadStream(filePath).pipe(res);
});
