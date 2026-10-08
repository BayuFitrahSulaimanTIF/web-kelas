// Cek card carousel: markup, style, dan urutan babak scrollytelling.
// Jalankan: node backend/scripts/check-cards-ui.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const dash = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'css/cards.css'), 'utf8');

let bad = 0;
const check = (name, ok, extra) => {
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name + (extra ? '  -> ' + extra : ''));
};

console.log('-- slide & markup --');
const slides = [...dash.matchAll(/<figure class="film-slide[^"]*" data-scene-name="([^"]+)"/g)].map((m) => m[1]);
check('tepat 7 babak', slides.length === 7, slides.join(' > '));
check('slip Kartu ada setelah Sorotan', slides[0] === 'Sorotan' && slides[1] === 'Kartu', slides.slice(0, 2).join(' , '));
for (const id of ['card-shell', 'card-media', 'card-img', 'card-body', 'card-desc', 'card-title', 'card-back', 'card-prev', 'card-next', 'card-dots', 'card-editor']) {
  check('id ' + id, dash.includes('id="' + id + '"'));
}

console.log('');
console.log('-- panjang lintasan scroll ikut 7 babak --');
check('tinggi film 11.9 (7 x 1.7)', /h \* 11\.9/.test(dash));
check('CSS 1190vh', /height:\s*1190vh/.test(fs.readFileSync(path.join(root, 'style.css'), 'utf8')));
check('FILM_NAV bergeser ke 2..5', /FILM_NAV = \{ 2: 'class', 3: 'community', 4: 'news', 5: 'library' \}/.test(dash));
check('KRS -> 2', /data-scene-name="KRS" data-goto-page="2"/.test(dash));
check('Perpustakaan -> 5', /data-scene-name="Perpustakaan" data-goto-page="5"/.test(dash));

console.log('');
console.log('-- interaksi kartu --');
check('klik kartu membuka deskripsi', /shell\.classList\.add\('is-open'\)/.test(dash));
check('tombol kembali menutup', /shell\.classList\.remove\('is-open'\)/.test(dash));
check('panah kiri/kanan berpindah kartu', /show\(idx - 1\)/.test(dash) && /show\(idx \+ 1\)/.test(dash));
check('Escape menutup', /e\.key === 'Escape'/.test(dash));
check('tombol di dalam kartu tidak memicu buka', /closest\('button, a, input, textarea, select, label'\)/.test(dash));

console.log('');
console.log('-- hak edit --');
check('panel edit disembunyikan di markup', /id="card-editor"[^>]*hidden/.test(dash));
check('hanya ditcuando server mengizinkan', /canEdit = !!\(d && d\.editor\)/.test(dash));
check('memakai fetchAuth (bukan fetch polos)', /fetchAuth\(API_ORIGIN \+ '\/api\/cards\//.test(dash));
check('tiga endpoint dipakai', /\/api\/cards\/' \+ slotOf/.test(dash) && /\/image', \{ method: 'POST'/.test(dash) && /\/image', \{ method: 'DELETE'/.test(dash));

console.log('');
console.log('-- CSS: transisi halus --');
check('.is-open menggerakkan media', /\.card-shell\.is-open \.card-media\s*\{[^}]*opacity: 0/.test(css));
check('.is-open menggerakkan body', /\.card-shell\.is-open \.card-body\s*\{[^}]*opacity: 1/.test(css));
check('judul punya transition', /\.card-title\s*\{[^}]*transition:/.test(css));
check('judul pindah ke tengah atas', /\.card-shell\.is-open \.card-title\s*\{[^}]*left: 50%[^}]*top: 0/.test(css));
check('judul default pojok kiri bawah', /\.card-title\s*\{[^}]*left: 0[\s\S]{0,120}?bottom: 0/.test(css));
check('tombol kembali muncul halus', /\.card-shell\.is-open \.card-back\s*\{[^}]*opacity: 1/.test(css));
// Transisi buka/tutup kartu harus terasa halus. Delay (stagger) sengaja
// kecil dan tidak dihitung; yang diperiksa durasi primernya saja.
const durChecks = [
  ['.card-media', /transition:\s*opacity 0\.42s[^;]*transform 0\.55s/],
  ['.card-body', /transition:\s*opacity 0\.42s[^;]*transform 0\.5s/],
  ['.card-title', /transition:\s*left 0\.5s[^;]*top 0\.5s[^;]*bottom 0\.5s[^;]*transform 0\.5s/],
  ['.card-shell', /transition:\s*transform 0\.45s[^;]*box-shadow 0\.45s/]
];
let slow = 0;
for (const [sel, re] of durChecks) {
  const okDur = re.test(css);
  if (!okDur) slow++;
  console.log('    ' + (okDur ? 'lulus' : 'GAGAL') + ' ' + sel);
}
check('transisi buka/tutup halus (>= 0.42s)', slow === 0, slow + ' tidak sesuai');

console.log('');
console.log('-- ukuran kartu --');
check('lebar dibatasi clamp', /\.card-shell\s*\{[^}]*width: clamp\(/.test(css));
check('tinggi dibatasi max-height', /\.card-shell\s*\{[^}]*max-height:/.test(css));
check('css Cards dimuat di dashboard', /css\/cards\.css\?v=/.test(dash));

console.log('');
console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan card carousel lulus.');
process.exit(bad ? 1 : 0);