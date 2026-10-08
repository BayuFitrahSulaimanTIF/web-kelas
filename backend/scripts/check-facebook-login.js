// Cek login Facebook: alur OAuth redirect, isolating dari Google/GitHub.
// Jalankan: node backend/scripts/check-facebook-login.js

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const ctrl = read('backend/controllers/facebookAuthController.js');
const shared = read('backend/utils/oauthWebFlow.js');
const routes = read('backend/routes/facebookAuth.js');
const env = read('backend/config/env.js');
const app = read('backend/app.js');
const html = read('index.html');
const js = read('js/facebook-login.js');
const cb = read('sso-callback.html');

let bad = 0;
const check = (name, ok, extra) => {
  if (!ok) bad++;
  console.log((ok ? 'lulus  ' : 'GAGAL  ') + name + (extra ? '  -> ' + extra : ''));
};

console.log('-- routing --');
check('route di-mount', /app\.use\('\/api\/auth\/facebook', facebookAuthRoutes\)/.test(app));
check('router punya config/start/callback',
  /router\.get\('\/config'/.test(routes) && /router\.get\('\/start'/.test(routes) && /router\.get\('\/callback'/.test(routes));
check('start & callback dibatasi rate limiter', (routes.match(/limiter,/g) || []).length === 2);

console.log('');
console.log('-- flow OAuth --');
check('tukar code di graph.facebook.com', /graph\.facebook\.com.*oauth\/access_token/.test(ctrl));
check('scope public_profile, bukan email', /scope: 'public_profile'/.test(ctrl), 'email ditolak dialog');
check('email diambil dari field profil', /fields: 'id,name,email,picture\.type\(large\)'/.test(ctrl));
check('state acak 16 byte', shared.includes('crypto.randomBytes(16)'));
check('state diverifikasi', /state !== expected/.test(ctrl));
check('callback tolak request tanpa state', /!code \|\| !state \|\| !expected/.test(ctrl));
check('cookie state HttpOnly', /'HttpOnly'/.test(shared));
check('cookie state SameSite=Lax', /'SameSite=Lax'/.test(shared));
check('Secure hanya saat https', /startsWith\('https:\/\/'\)\) parts\.push\('Secure'\)/.test(shared));

console.log('');
console.log('-- isolasi antar provider --');
check('path cookie khusus facebook', /COOKIE_PATH = '\/api\/auth\/facebook'/.test(ctrl));
check('nama cookie facebook', /facebook_oauth_state/.test(ctrl));
check('prefix google_id dipakai', /facebook:/.test(ctrl));
check('tidak menimpa is_active', !/is_active\s*=/.test(ctrl));

console.log('');
console.log('-- wilayah & secrets --');
check('appId & appSecret dari env', /FACEBOOK_APP_ID/.test(env) && /FACEBOOK_APP_SECRET/.test(env));
check('domain bisa dibatasi', /FACEBOOK_ALLOWED_DOMAIN/.test(env));
check('pesan domain sama dengan Google', /Login gagal\. Gunakan Email Unesa!/.test(ctrl));
check('warn kalau secret kosong', /FACEBOOK_APP_ID \/ FACEBOOK_APP_SECRET belum diisi/.test(env));
check('tidak ada secret hardcoded', !/4ac40bfa8ddf/.test(ctrl) && !/4ac40bfa8ddf/.test(shared) && !/4ac40bfa8ddf/.test(app));

console.log('');
console.log('-- tombol ikon-only --');
check('tautan ada di index.html', /id="facebook-login"/.test(html));
check('href awal "#" lalu diisi backend', /id="facebook-login" href="#"/.test(html) && /state\.link\.href = config\.startUrl/.test(js));
check('disembunyikan sampai config true', /state\.link\.hidden = false/.test(js) && /id="facebook-login"[^>]*hidden/.test(html));
check('gaya ikon sama seperti GitHub', /class="oauth-mark" id="facebook-login"/.test(html));
check('svg path filled #1877F2', /fill="#1877F2"/.test(html));
check('ada aria-label', /aria-label="Masuk dengan Facebook"/.test(html));
check('skrip dimuat', /js\/facebook-login\.js/.test(html));

console.log('');
console.log('-- halaman proses --');
check('halaman punya logo facebook', /brand-icon-facebook/.test(cb));
check('label teks menyesuaikan', /Login ' \+ label \+ ' berhasil/.test(cb));
check('github tetap pakai logo sendiri', /brand-icon'/.test(cb) && /provider === 'facebook' \? 'brand-icon-facebook' : 'brand-icon'/.test(cb));

console.log('');
console.log('-- tidak ada kode kembar --');
for (const file of ['backend/controllers/githubAuthController.js', 'backend/controllers/googleAuthController.js', 'backend/controllers/facebookAuthController.js']) {
  const t = read(file);
  check(file.split('/').pop() + ' tidak punya helper sendiri',
    !/function usernameFromName/.test(t) && !/async function uniqueUsername/.test(t) && !/function postForm\(/.test(t));
}
check('modulshared dipakai ketiga controller',
  /oauthWebFlow/.test(ctrl) && /oauthWebFlow/.test(read('backend/controllers/githubAuthController.js')) && /oauthWebFlow/.test(read('backend/controllers/googleAuthController.js')));

console.log('');
console.log(bad ? bad + ' pemeriksaan gagal.' : 'Semua pemeriksaan login Facebook lulus.');
process.exit(bad ? 1 : 0);