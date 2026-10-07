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
function download(url, allowedHosts, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (error) {
      reject(new Error('URL foto tidak valid'));
      return;
    }

    if (target.protocol !== 'https:' || !allowedHosts.test(target.hostname)) {
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
        download(new URL(res.headers.location, target).toString(), allowedHosts, redirectsLeft - 1)
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
  return saveRemotePicture(userId, pictureUrl, 'google', ALLOWED_HOSTS);
}

// Bentuk yang sama dipakai login GitHub, hanya host yang diizinkan berbeda.
async function saveGitHubPicture(userId, avatarUrl) {
  const hosts = /(^|\.)githubusercontent\.com$|(^|\.)github\.com$|(^|\.)githubassets\.com$/;
  return saveRemotePicture(userId, avatarUrl, 'github', hosts);
}

async function saveRemotePicture(userId, url, prefix, allowedHosts) {
  const previous = fs.readdirSync(AVATAR_DIR)
    .filter((name) => name.startsWith(userId + '-' + prefix + '-'));

  try {
    const data = await download(url, allowedHosts);
    const filename = userId + '-' + prefix + '-' + Date.now() + '.jpg';
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

module.exports = { saveGooglePicture, saveGitHubPicture };