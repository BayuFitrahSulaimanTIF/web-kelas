// ===================================================
// UNDUH FOTO PROFIL DARI GOOGLE
// Google hanya memberi URL gambar (lh3.googleusercontent.com),
// bukan file. supaya kolom `avatar` yang sudah ada tetap bisa
// dipakai apa adanya di semua tampilan, gambarnya diunduh
// sekali lalu disimpan ke uploads/avatars/<userId>-<timestamp>.jpg
// ===================================================

const fs = require('fs');
const path = require('path');
const https = require('https');

const { AVATAR_DIR } = require('./avatarUpload');

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_HOSTS = /(^|\.)googleusercontent\.com$|(^|\.)ggpht\.com$/;
const TIMEOUT_MS = 5000;

// Ikuti redirect beberapa kali; lh3 sering mengarahkan ke CDN lain.
function download(url, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (error) {
      reject(new Error('URL foto tidak valid'));
      return;
    }

    if (target.protocol !== 'https:' || !ALLOWED_HOSTS.test(target.hostname)) {
      reject(new Error('Host foto tidak diizinkan'));
      return;
    }

    const req = https.get(target, { timeout: TIMEOUT_MS }, (res) => {
      const status = res.statusCode;

      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        if (redirectsLeft === 0) {
          reject(new Error('Terlalu banyak redirect'));
          return;
        }
        download(new URL(res.headers.location, target).toString(), redirectsLeft - 1)
          .then(resolve, reject);
        return;
      }

      if (status !== 200) {
        res.resume();
        reject(new Error('Google menjawab ' + status));
        return;
      }

      const type = String(res.headers['content-type'] || '');
      if (!type.startsWith('image/')) {
        res.resume();
        reject(new Error('Bukan gambar'));
        return;
      }

      const chunks = [];
      let size = 0;

      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          req.destroy();
          reject(new Error('Foto terlalu besar'));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Waktu habis'));
    });
    req.on('error', reject);
  });
}

// Foto profil adalah hiasan. Kalau gagal diunduh, login tetap
// berjalan tanpa foto — bukan menggagalkan seluruh login.
async function saveGooglePicture(userId, pictureUrl) {
  const previous = fs.readdirSync(AVATAR_DIR)
    .filter((name) => name.startsWith(userId + '-google-'));

  try {
    const data = await download(pictureUrl);
    const filename = userId + '-google-' + Date.now() + '.jpg';
    fs.writeFileSync(path.join(AVATAR_DIR, filename), data);

    previous.forEach((old) => {
      try {
        fs.unlinkSync(path.join(AVATAR_DIR, old));
      } catch (error) {
        // file lama sudah hilang, tidak masalah
      }
    });

    return filename;
  } catch (error) {
    return null;
  }
}

module.exports = { saveGooglePicture };