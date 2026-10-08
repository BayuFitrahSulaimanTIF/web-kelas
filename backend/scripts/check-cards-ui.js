// Cek card carousel: markup, script, dan CSS untuk versi scroll-snap.
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

console.log('-- slide & wadah --');
const slides = [...dash.matchAll(/<figure class="film-slide[^"]*" data-scene-name="([^"]+)"/g)].map((m) => m[1]);
check('tepat 7 babak', slides.length === 7, slides.join(' > '));
check('slip Kartu setelah Sorotan', slides[0] === 'Sorotan' && slides[1] === 'Kartu');
for (const id of ['cards-viewport', 'cards-track', 'card-prev', 'card-next', 'card-dots', 'card-editor']) {
  check('wadah #' + id, dash.includes('id="' + id + '"'));
}
check('wadah .cards-area', dash.includes('class="cards-area"'));
check('kartu dibuat JS, bukan markup', !dash.includes('id="card-shell"'));

console.log('');
console.log('-- bentuk potret --');
check('aspect 3/4 (potret)', /aspect-ratio:\s*3\s*\/\s*4/.test(css));
check('bukan 4/3 lagi', !/aspect-ratio:\s*4\s*\/\s*3/.test(css));
check('lebar lebih kecil dari tinggi', /width:\s*clamp\(200px, 26vw, 330px\)/.test(css));
check('tinggi dibatasi', /max-height:\s*min\(60vh, 520px\)/.test(css));

console.log('');
console.log('-- geser mulus (scroll-snap, tanpa JS animasi) --');
check('scroll-snap-type mandatory', /scroll-snap-type:\s*x mandatory/.test(css));
check('scroll-behavior smooth', /scroll-behavior:\s*smooth/.test(css));
check('snap align center', /scroll-snap-align:\s*center/.test(css));
check('viewport bisa digeser', /\.cards-viewport\s*\{[^}]*overflow-x:\s*auto/.test(css));
check('scrollbar disembunyikan', /scrollbar-width:\s*none/.test(css) && /::-webkit-scrollbar\s*\{\s*display:\s*none/.test(css));
check('track berupa baris kartu', /\.cards-track\s*\{[^}]*display:\s*flex/.test(css));

console.log('');
console.log('-- geser via tombol & titik --');
check('go() memakai scrollTo smooth', /viewport\.scrollTo\(\{ left: target, behavior: instant \? 'auto' : 'smooth' \}\)/.test(dash));
check('panah kiri/kanan memanggil go', /go\(idx - 1\)/.test(dash) && /go\(idx \+ 1\)/.test(dash));
check('titik bisa dipilih', /dot\.addEventListener\('click', function \(\) \{ closeCard\(\); go\(n\); \}\)/.test(dash));

console.log('');
console.log('-- drag dengan tetikus & guarding klik --');
check('cursor grab saat siap drag', /\.cards-viewport\s*\{[^}]*cursor:\s*grab/.test(css));
check('cursor grabbing saat drag', /\.cards-viewport\.is-dragging\s*\{[^}]*cursor:\s*grabbing/.test(css));
check('snap dimatikan saat drag', /\.cards-viewport\.is-dragging\s*\{[^}]*scroll-snap-type:\s*none/.test(css));
check('pointermove menggeser scrollLeft', /viewport\.scrollLeft = dragStartScroll - dx/.test(dash));
check('pointerup dan pointercancel menutup drag', /addEventListener\('pointerup', endDrag\)/.test(dash) && /addEventListener\('pointercancel', endDrag\)/.test(dash));
check('drag tidak dianggap klik', /Math\.abs\(e\.clientX - dragFrom\) > 6/.test(dash));
check('indeks ikut posisi scroll', /function syncIndexFromScroll\(\)/.test(dash));

console.log('');
console.log('-- kartu pertama/terakhir tidak terpotong --');
check('padding track dihitung', /function padTrack\(\)/.test(dash));
check('padTrack dipakai saat render', /track\.innerHTML = html;\s*\n\s*padTrack\(\);/.test(dash));
check('padTrack dipakai saat resize', /window\.addEventListener\('resize', function \(\) \{\s*\n\s*padTrack\(\);/.test(dash));

console.log('');
console.log('-- interaksi buka/tutup (per kartu) --');
check('klik kartu membuka', /openCard\(i\)/.test(dash));
check('is-open di kelas kartu', /el\.classList\.add\('is-open'\)/.test(dash));
check('tombol kembali menutup', /closeCard\(\)/.test(dash) && /back\.addEventListener\('click', function \(e\) \{ e\.stopPropagation\(\); closeCard\(\); \}\)/.test(dash));
check('hanya satu kartu terbuka', /openIndex = -1/.test(dash) && /if \(openIndex === i\) return;/.test(dash));
check('Escape menutup', /e\.key === 'Escape'/.test(dash));
check('tombol di dalam kartu tidak memicu', /closest\('button, a, input, textarea, select, label'\)/.test(dash));

console.log('');
console.log('-- keamanan & hak edit --');
check('isi kartu di-escape', /function esc\(s\)/.test(dash) && /esc\(c\.description\)/.test(dash) && /esc\(c\.title\)/.test(dash));
check('panel edit disembunyikan di markup', /id="card-editor"[^>]*hidden/.test(dash));
check('hak edit ditentukan server', /canEdit = !!\(d && d\.editor\)/.test(dash));
check('pakai fetchAuth', /fetchAuth\(API_ORIGIN \+ '\/api\/cards\//.test(dash));
check('ketiga endpoint dipakai', /\/api\/cards\/' \+ slot\(\)/.test(dash) && /\/image', \{ method: 'POST'/.test(dash) && /\/image', \{ method: 'DELETE'/.test(dash));

console.log('');
console.log('-- transisi halus --');
const durChecks = [
  ['.card-media', /transition:\s*opacity 0\.42s[^;]*transform 0\.55s/],
  ['.card-body', /transition:\s*opacity 0\.42s[^;]*transform 0\.5s/],
  ['.card-title', /transition:\s*left 0\.5s[^;]*top 0\.5s[^;]*bottom 0\.5s[^;]*transform 0\.5s/],
  ['.card-shell', /transition:\s*transform 0\.45s[^;]*box-shadow 0\.45s[^;]*opacity 0\.35s/],
  ['.card-back', /transition:\s*opacity 0\.32s[^;]*transform 0\.32s/]
];
for (const [sel, re] of durChecks) check('transisi ' + sel + ' >= 0.32s', re.test(css));

console.log('');
console.log('-- urutan babak tetap benar --');
check('tinggi film 11.9', /h \* 11\.9/.test(dash));
check('CSS 1190vh', /height:\s*1190vh/.test(fs.readFileSync(path.join(root, 'style.css'), 'utf8')));
check('FILM_NAV 2..5', /FILM_NAV = \{ 2: 'class', 3: 'community', 4: 'news', 5: 'library' \}/.test(dash));

console.log('');
console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan card carousel lulus.');
process.exit(bad ? 1 : 0);