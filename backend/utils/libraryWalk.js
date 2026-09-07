// ===================================================
// UTIL LIBRARY WALK (dipakai app.js & communityController)
// ===================================================

const fs = require('fs');
const path = require('path');

const LIBRARY_DIR = 'C:/Users/t/Downloads/library';
const LIBRARY_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'gif', 'txt']);

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

function listLibraryFiles() {
  return walkLibrary(LIBRARY_DIR, LIBRARY_DIR, []);
}

module.exports = { LIBRARY_DIR, walkLibrary, listLibraryFiles };