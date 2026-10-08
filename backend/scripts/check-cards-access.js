// Verifikasi hak edit card carousel: hanya satu akun yang boleh mengubah.
// Jalankan: node backend/scripts/check-cards-access.js

const { BASE } = require('./checkToken');
const KLEMENT_PW = '9597DYJjxtq#$';

let bad = 0;
const check = (name, ok, extra) => {
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name + (extra ? '  -> ' + extra : ''));
};

const { tokenFor } = require('./checkToken');
async function login(username, password) {
  const t = await tokenFor(username, password);
  return { token: t, username: username };
}

(async () => {
  const klement = await login('Klement Ezra Suhartanto', KLEMENT_PW);
  const other = await login('25051204031@mhs.unesa.ac.id', 'RBJ^!6853ajfj'); // Alvito, admin lain

  const auth = (t) => ({ Authorization: 'Bearer ' + t });

  console.log('-- siapa boleh mengedit --');
  const whoK = await (await fetch(BASE + '/api/cards/whoami', { headers: auth(klement.token) })).json();
  check('Klement boleh mengedit', whoK.editor === true, whoK.username);
  const whoO = await (await fetch(BASE + '/api/cards/whoami', { headers: auth(other.token) })).json();
  check('admin lain TIDAK boleh mengedit', whoO.editor === false, whoO.username);

  console.log('');
  console.log('-- semua pengguna login boleh membaca --');
  const read = await fetch(BASE + '/api/cards', { headers: auth(other.token) });
  check('admin lain bisa membaca kartu', read.ok);
  const noauth = await fetch(BASE + '/api/cards');
  check('tanpa token ditolak', noauth.status === 401, 'status ' + noauth.status);

  console.log('');
  console.log('-- hanya Klement boleh mengubah --');
  const deny = await fetch(BASE + '/api/cards/1', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth(other.token)),
    body: JSON.stringify({ title: 'DIRETAK' })
  });
  check('admin lain DITOLAK saat ubah judul', deny.status === 403, 'status ' + deny.status);

  const allow = await fetch(BASE + '/api/cards/1', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth(klement.token)),
    body: JSON.stringify({ title: 'Judul uji sementara' })
  });
  check('Klement BOLEH ubah judul', allow.ok, 'status ' + allow.status);

  // kembalikan judul supaya tidak meninggalkanjejak
  await fetch(BASE + '/api/cards/1', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth(klement.token)),
    body: JSON.stringify({ title: 'Kartu 1' })
  });
  const back = await (await fetch(BASE + '/api/cards', { headers: auth(klement.token) })).json();
  check('judul kembali seperti semula', back.cards[0].title === 'Kartu 1', back.cards[0].title);

  console.log('');
  console.log('-- validasi --');
  const badSlot = await fetch(BASE + '/api/cards/99', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth(klement.token)),
    body: JSON.stringify({ title: 'x' })
  });
  check('slot di luar 1-7 ditolak', badSlot.status === 404, 'status ' + badSlot.status);

  const empty = await fetch(BASE + '/api/cards/1', {
    method: 'PUT',
    headers: Object.assign({ 'Content-Type': 'application/json' }, auth(klement.token)),
    body: JSON.stringify({})
  });
  check('permintaan kosong ditolak', empty.status === 400, 'status ' + empty.status);

  console.log('');
  console.log('-- bentuk data --');
  check('tepat 7 kartu', back.cards.length === 7, 'jumlah ' + back.cards.length);
  check('tiada kartu tanpa slot', back.cards.every((c) => Number.isInteger(c.slot)));
  check('gambar kosong/null di awal', back.cards.every((c) => !c.image));

  console.log('');
  console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan hak akses kartu lulus.');
  process.exit(bad ? 1 : 0);
})().catch((e) => {
  console.error('ERROR', e.message);
  process.exit(1);
});