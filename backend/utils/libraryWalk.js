// ===================================================
// UTIL LIBRARY WALK (dipakai app.js & communityController)
// ===================================================

const fs = require('fs');
const path = require('path');

const LIBRARY_DIR = 'C:/Users/t/Downloads/library';
const LIBRARY_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt', 'mp4']);

function walkLibrary(dir, base, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkLibrary(full, base, out);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!LIBRARY_EXTENSIONS.has(ext)) continue;
      const rel = path.relative(base, full).split(path.sep).join('/');
      out.push({ relativePath: rel, name: entry.name, size: fs.statSync(full).size });
    }
  }
  return out;
}

// Scan ribuan file tiap request itu berat (readdir + stat per file), jadi hasilnya
// ditahan di memory. Cache basi kalau ada file yang ditambah langsung lewat
// Explorer (bukan lewat upload), jadi tetap kedaluwarsa setelah CACHE_TTL_MS
// atau di-refresh paksa. Hasilnya dibaca saja, jangan dimutasi.
const CACHE_TTL_MS = 60 * 1000;
let cachedFiles = null;
let cachedAt = 0;

function listLibraryFiles(force) {
  const fresh = cachedFiles && Date.now() - cachedAt < CACHE_TTL_MS;
  if (force || !fresh) {
    cachedFiles = walkLibrary(LIBRARY_DIR, LIBRARY_DIR, []);
    cachedAt = Date.now();
  }
  return cachedFiles;
}

function invalidateLibraryCache() {
  cachedFiles = null;
  cachedAt = 0;
}

module.exports = { LIBRARY_DIR, walkLibrary, listLibraryFiles, invalidateLibraryCache };
