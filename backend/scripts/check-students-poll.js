// Uji logika poll daftar Students: render hanya saat data berubah.
// Jalankan: node backend/scripts/check-students-poll.js

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../../dashboard.html'), 'utf8');
const start = html.indexOf('const STUDENTS_POLL_MS');
const end = html.indexOf('function genderLabel');
if (start === -1 || end === -1) throw new Error('blok pollStudents tidak ditemukan');
const source = html.slice(start, end);

// Potongan kode pollStudents diambil apa adanya dari dashboard.html, jadi
// yang diuji benar-benar kode yang berjalan, bukan salinan.
const body = `
  var studentsCache = state.cache;
  var studentsPrint = state.print;
  ${source}
  state.fingerprint = studentsFingerprint;
  state.poll = pollStudents;
  state.getCache = function () { return studentsCache; };
  state.setPrint = function (v) { studentsPrint = v; };
`;

function makeSandbox({ hidden = false, viewVisible = true, responses = [], cache = null } = {}) {
  const listEl = { innerHTML: '', scrollTop: 0 };
  const stats = { renders: 0, fetches: 0 };
  const state = { cache, print: '' };

  const documentStub = {
    hidden,
    getElementById: (id) => {
      if (id === 'students-list') return listEl;
      if (id === 'students-view') return { style: { display: viewVisible ? 'block' : 'none' } };
      return null;
    },
  };

  new Function('state', 'document', 'API_ORIGIN', 'authHeaders', 'fetch', 'renderStudents', body)(
    state,
    documentStub,
    '',
    () => ({}),
    () => {
      stats.fetches++;
      const users = responses.shift() || [];
      return Promise.resolve({ json: () => Promise.resolve({ users }) });
    },
    () => { stats.renders++; }
  );

  return { state, listEl, stats };
}

const tick = () => new Promise((r) => setTimeout(r, 5));
const clone = (v) => JSON.parse(JSON.stringify(v));

let bad = 0;
const check = (name, ok, extra) => {
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name + (extra ? '  -> ' + extra : ''));
};

(async () => {
  const base = [
    { id: 1, bio: '', avatar: null },
    { id: 2, bio: 'halo', avatar: null },
  ];
  //-cache siap pakai supaya poll()-nya tidak dilewati karena cache kosong.
  const primed = (users) => {
    const t = makeSandbox({ cache: clone(users) });
    t.state.setPrint(t.state.fingerprint(users));
    return t;
  };

  let t = makeSandbox({ viewVisible: false, responses: [clone(base)] });
  await t.state.poll(); await tick();
  check('tidak ada request saat view Students disembunyikan', t.stats.fetches === 0, 'fetches=' + t.stats.fetches);

  t = makeSandbox({ hidden: true, responses: [clone(base)] });
  await t.state.poll(); await tick();
  check('tidak ada request saat tab browser hidden', t.stats.fetches === 0, 'fetches=' + t.stats.fetches);

  t = makeSandbox({ responses: [clone(base)] });
  await t.state.poll(); await tick();
  check('tidak request sebelum cache terisi', t.stats.fetches === 0, 'fetches=' + t.stats.fetches);

  t = primed(base);
  t.state.getCache && t.stats;
  // kembalikan responses untuk poll berikutnya
  t = makeSandbox({ responses: [clone(base)], cache: clone(base) });
  t.state.setPrint(t.state.fingerprint(base));
  await t.state.poll(); await tick();
  check('data identik -> request tapi tanpa render', t.stats.fetches === 1 && t.stats.renders === 0,
    'fetches=' + t.stats.fetches + ' renders=' + t.stats.renders);

  const withNewBio = [
    { id: 1, bio: 'baru', avatar: null },
    { id: 2, bio: 'halo', avatar: null },
  ];
  t = makeSandbox({ responses: [clone(withNewBio)], cache: clone(base) });
  t.state.setPrint(t.state.fingerprint(base));
  await t.state.poll(); await tick();
  check('bio berubah -> render tepat sekali', t.stats.renders === 1, 'renders=' + t.stats.renders);
  check('cache bio ikut ter-update', t.state.getCache()[0].bio === 'baru');
  check('posisi scroll dijaga', t.listEl.scrollTop === 0);

  const withAvatar = [
    { id: 1, bio: '', avatar: 'a.png' },
    { id: 2, bio: 'halo', avatar: null },
  ];
  t = makeSandbox({ responses: [clone(withAvatar)], cache: clone(base) });
  t.state.setPrint(t.state.fingerprint(base));
  await t.state.poll(); await tick();
  check('avatar berubah -> render tepat sekali', t.stats.renders === 1, 'renders=' + t.stats.renders);

  const fp = makeSandbox({}).state.fingerprint;
  // null dan '' sama-sama dirender "Tidak ada bio.", jadi sengaja dianggap
  // sama supaya tidak memicu render tanpa alasan.
  check('bio null dan string kosong dianggap sama', fp([{ id: 1, bio: null }]) === fp([{ id: 1, bio: '' }]));
  check('bio kosong vs berisi dianggap berbeda', fp([{ id: 1, bio: '' }]) !== fp([{ id: 1, bio: 'x' }]));
  check('urutan data berbeda dianggap berubah', fp([{ id: 1 }, { id: 2 }]) !== fp([{ id: 2 }, { id: 1 }]));

  console.log('');
  console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan pollStudents lulus.');
  process.exit(bad ? 1 : 0);
})();