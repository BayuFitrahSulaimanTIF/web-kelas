// ===================================================
// CARD CAROUSEL BERANDA
// Tujuh kartu yang bisa diisi gambar, judul, dan deskripsi.
// Penyimpanan memakai berkas JSON, sama seperti berita dan banner
// yang sudah dipakai proyek ini (backend/news.json, banners.json).
//
// Hanya satu akun yang boleh mengubah isinya: akun admin dengan
// username "Klement Ezra Suhartanto". everybody else read-only.
// ===================================================

const fs = require('fs');
const path = require('path');

const CARDS_FILE = path.join(__dirname, '..', 'cards.json');
// __dirname = backend/utils, jadi uploads ada satu level di atas.
const CARD_IMG_DIR = path.join(__dirname, '..', 'uploads', 'cards');
const CARD_COUNT = 7;

// Satu-satunya akun yang boleh mengedit. Dipakai bersama oleh
// middleware dan oleh frontend (lewat /api/cards/whoami).
const EDITOR_USERNAME = 'Klement Ezra Suhartanto';
const EDITOR_MESSAGE = 'Hanya akun ' + EDITOR_USERNAME + ' yang dapat mengubah kartu beranda';

fs.mkdirSync(CARD_IMG_DIR, { recursive: true });

function defaults() {
  const out = [];
  for (let slot = 1; slot <= CARD_COUNT; slot++) {
    out.push({
      slot,
      title: 'Kartu ' + slot,
      description: 'Deskripsi kartu ' + slot + '. Klik kartunya untuk membaca.',
      image: null
    });
  }
  return out;
}

// Selalu kembalikan 7 kartu walau berkasnya rusak/kurang, supaya
// frontend tidak perlu menangani kasus jumlah kartu berubah-ubah.
function loadCards() {
  let raw = null;
  try {
    raw = JSON.parse(fs.readFileSync(CARDS_FILE, 'utf8'));
  } catch (error) {
    raw = null;
  }

  const list = Array.isArray(raw) ? raw : [];
  const byslot = new Map(list.map((c) => [Number(c && c.slot), c]));
  const out = defaults();

  for (const card of out) {
    const found = byslot.get(card.slot);
    if (!found) continue;
    card.title = String(found.title || card.title).slice(0, 120);
    card.description = String(found.description || card.description).slice(0, 800);
    card.image = typeof found.image === 'string' && found.image ? found.image : null;
  }

  return out;
}

function saveCard(slot, patch) {
  const cards = loadCards();
  const card = cards.find((c) => c.slot === slot);
  if (!card) return null;

  if (patch.title !== undefined) card.title = String(patch.title).slice(0, 120);
  if (patch.description !== undefined) card.description = String(patch.description).slice(0, 800);
  if (patch.image !== undefined) card.image = patch.image || null;

  fs.writeFileSync(CARDS_FILE, JSON.stringify(cards, null, 2));
  return card;
}

// Gambar milik slot ini dihapus saat diganti supaya folder tidak menumpuk.
function removeCardImage(slot) {
  const cards = loadCards();
  const card = cards.find((c) => c.slot === slot);
  if (!card || !card.image) return;

  const name = path.basename(card.image);
  try { fs.unlinkSync(path.join(CARD_IMG_DIR, name)); } catch (e) {}
}

module.exports = {
  CARD_IMG_DIR,
  CARD_COUNT,
  EDITOR_USERNAME,
  EDITOR_MESSAGE,
  loadCards,
  saveCard,
  removeCardImage
};