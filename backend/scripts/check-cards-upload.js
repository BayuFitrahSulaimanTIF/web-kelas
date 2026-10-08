// Uji alur unggah gambar kartu lewat HTTP sungguhan.
// Jalankan: node backend/scripts/check-cards-upload.js

const fs = require('fs');
const path = require('path');
const os = require('os');

const { BASE } = require('./checkToken');
const DIR = path.join(__dirname, '..', 'uploads', 'cards');

let bad = 0;
const check = (name, ok, extra) => {
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name + (extra ? '  -> ' + extra : ''));
};

// PNG 1x1 paling kecil yang sah.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64'
);

const { tokenFor } = require('./checkToken');
const token = tokenFor;

(async () => {
  const klement = await token('Klement Ezra Suhartanto', '9597DYJjxtq#$');
  const other = await token('25051204031@mhs.unesa.ac.id', 'RBJ^!6853ajfj');
  const auth = (t) => ({ Authorization: 'Bearer ' + t });

  const before = fs.existsSync(DIR) ? fs.readdirSync(DIR).length : 0;
  check('folder upload ada', fs.existsSync(DIR));

  console.log('');
  console.log('-- unggah PNG --');
  const fd = new FormData();
  fd.append('image', new Blob([PNG_1x1], { type: 'image/png' }), 'uji.png');
  const up = await fetch(BASE + '/api/cards/2/image', { method: 'POST', headers: auth(klement), body: fd });
  const upBody = await up.json();
  check('unggahan Klement diterima', up.ok, 'status ' + up.status);
  check('gambar tersimpan di /uploads/cards', /^\/uploads\/cards\/card-2-/.test(upBody.card.image || ''), upBody.card.image);
  check('file benar-benar ada di disk', fs.existsSync(path.join(DIR, path.basename(upBody.card.image))));

  const served = await fetch(BASE + upBody.card.image);
  check('gambar bisa diakses lewat HTTP', served.ok, 'status ' + served.status);
  check('dilayani dengan nosniff', served.headers.get('x-content-type-options') === 'nosniff');

  console.log('');
  console.log('-- tolak file palsu --');
  const fake = new FormData();
  fake.append('image', new Blob([Buffer.from('<?php echo 1; ?>')], { type: 'image/png' }), 'palsu.png');
  const fakeUp = await fetch(BASE + '/api/cards/3/image', { method: 'POST', headers: auth(klement), body: fake });
  check('file non-gambar ditolak', fakeUp.status === 400, 'status ' + fakeUp.status);
  check('file palsu tidak tertinggal', !fs.readdirSync(DIR).some((f) => f.includes('palsu')));

  const badExt = new FormData();
  badExt.append('image', new Blob([PNG_1x1]), 'virus.exe');
  const badUp = await fetch(BASE + '/api/cards/3/image', { method: 'POST', headers: auth(klement), body: badExt });
  check('ekstensi terlarang ditolak', badUp.status === 400, 'status ' + badUp.status);

  console.log('');
  console.log('-- hak unggah --');
  const denied = new FormData();
  denied.append('image', new Blob([PNG_1x1]), 'x.png');
  const denyUp = await fetch(BASE + '/api/cards/2/image', { method: 'POST', headers: auth(other), body: denied });
  check('admin lain DITOLAK mengunggah', denyUp.status === 403, 'status ' + denyUp.status);

  const noAuth = await fetch(BASE + '/api/cards/2/image', { method: 'POST' });
  check('tanpa token ditolak', noAuth.status === 401, 'status ' + noAuth.status);

  console.log('');
  console.log('-- bersihkan jejak uji --');
  const del = await fetch(BASE + '/api/cards/2/image', { method: 'DELETE', headers: auth(klement) });
  check('gambar bisa dihapus', del.ok);
  const gone = await fetch(BASE + upBody.card.image);
  check('file hilang setelah dihapus', gone.status === 404, 'status ' + gone.status);

  const after = fs.existsSync(DIR) ? fs.readdirSync(DIR) : [];
  check('tidak ada sisa file uji', !after.some((f) => f.includes('palsu') || f.includes('virus')), after.length + ' file');

  const cards = await (await fetch(BASE + '/api/cards', { headers: auth(klement) })).json();
  check('semua kartu kembali tanpa gambar', cards.cards.every((c) => !c.image));

  console.log('');
  console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan unggah kartu lulus.');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});