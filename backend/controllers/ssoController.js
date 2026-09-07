const Student = require('../models/Student');
const User = require('../models/User');
const PasswordCodec = require('../utils/passwordCodec');
const { generateAccountToken } = require('../utils/accountToken');
const authController = require('./authController');

// ===================================================
// HALAMAN PORTAL SSO KAMPUS
// Mensimulasikan halaman login portal akademik kampus.
// ===================================================

const ssoPortalPage = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SSO Kampus - Portal Akademik</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: "Segoe UI", Arial, sans-serif;
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
    }
    .portal-card {
      width: min(420px, 92vw);
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.25);
      padding: 36px 32px;
    }
    .portal-brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 8px;
    }
    .portal-brand .logo {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #2563eb, #1e3a8a);
      color: #ffffff;
      display: grid;
      place-items: center;
      font-size: 20px;
      font-weight: 700;
    }
    .portal-brand h1 { font-size: 18px; color: #111827; }
    .portal-brand p { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .portal-title { text-align: center; font-size: 15px; color: #374151; margin: 18px 0 22px; }
    .portal-field { margin-bottom: 14px; }
    .portal-field label { display: block; font-size: 13px; font-weight: 600; color: #374151; margin-bottom: 6px; }
    .portal-field input {
      width: 100%;
      height: 46px;
      padding: 0 14px;
      border: 1px solid #d1d5db;
      border-radius: 10px;
      font-size: 14px;
      outline: none;
      transition: border-color 160ms ease, box-shadow 160ms ease;
    }
    .portal-field input:focus { border-color: #2563eb; box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12); }
    .portal-error {
      display: none;
      padding: 10px 12px;
      margin-bottom: 14px;
      background: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
      border-radius: 8px;
      font-size: 13px;
    }
    .portal-submit {
      width: 100%;
      height: 46px;
      margin-top: 6px;
      background: linear-gradient(90deg, #2f80ed, #2563eb);
      color: #ffffff;
      border: none;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      transition: transform 160ms ease, box-shadow 260ms ease;
    }
    .portal-submit:hover { transform: translateY(-1px); box-shadow: 0 10px 25px rgba(37, 99, 235, 0.35); }
    .portal-submit:disabled { opacity: 0.7; cursor: not-allowed; transform: none; }
    .portal-hint { margin-top: 16px; padding: 12px; background: #eff6ff; border-radius: 8px; font-size: 12px; color: #1d4ed8; text-align: center; }
    .portal-back { display: block; margin-top: 16px; text-align: center; font-size: 13px; color: #6b7280; text-decoration: none; }
    .portal-back:hover { color: #2563eb; }
  </style>
</head>
<body>
  <form class="portal-card" id="portal-form">
    <div class="portal-brand">
      <span class="logo">K</span>
      <div>
        <h1>Portal Akademik Kampus</h1>
        <p>Sistem Login Terpadu (SSO)</p>
      </div>
    </div>
    <p class="portal-title">Masuk dengan akun mahasiswa Anda</p>
    <div class="portal-error" id="portal-error"></div>
    <div class="portal-field">
      <label for="nim">NIM</label>
      <input type="text" id="nim" name="nim" placeholder="Contoh: 210101001" autocomplete="username" required>
    </div>
    <div class="portal-field">
      <label for="password">Kata Sandi Portal</label>
      <input type="password" id="password" name="password" placeholder="Masukkan kata sandi" autocomplete="current-password" required>
    </div>
    <button class="portal-submit" type="submit" id="portal-submit">Masuk</button>
    <div class="portal-hint">Akun demo: NIM 210101001 - kata sandi: sso123</div>
    <a class="portal-back" href="/">Kembali ke halaman login</a>
  </form>
  <script>
    (function () {
      var form = document.getElementById('portal-form');
      var errorEl = document.getElementById('portal-error');
      var submit = document.getElementById('portal-submit');

      form.addEventListener('submit', async function (event) {
        event.preventDefault();
        errorEl.style.display = 'none';
        submit.disabled = true;
        submit.textContent = 'Memproses...';

        try {
          var response = await fetch('/api/auth/sso/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              nim: document.getElementById('nim').value.trim(),
              password: document.getElementById('password').value
            })
          });

          var data = await response.json().catch(function () { return {}; });

          if (!response.ok) {
            errorEl.textContent = data.message || 'Login SSO gagal';
            errorEl.style.display = 'block';
            submit.disabled = false;
            submit.textContent = 'Masuk';
            return;
          }

          if (data.redirectUrl) {
            window.location.href = data.redirectUrl;
            return;
          }

          errorEl.textContent = 'Response tidak valid';
          errorEl.style.display = 'block';
          submit.disabled = false;
          submit.textContent = 'Masuk';
        } catch (error) {
          errorEl.textContent = 'Gagal terhubung ke server SSO';
          errorEl.style.display = 'block';
          submit.disabled = false;
          submit.textContent = 'Masuk';
        }
      });
    })();
  </script>
</body>
</html>
`;

// ===================================================
// GET /api/auth/sso/authorize
// Menampilkan halaman portal SSO kampus
// ===================================================

exports.authorize = (req, res) => {
  res.type('html').send(ssoPortalPage);
};

// ===================================================
// POST /api/auth/sso/callback
// Menerima NIM + password portal, lalu:
// 1. Validasi akun mahasiswa di tabel students
// 2. Buat/aktifkan user aplikasi (role mahasiswa)
// 3. Terbitkan access + refresh token dan redirect ke frontend
// ===================================================

exports.callback = async (req, res, next) => {
  try {
    const nim = String(req.body.nim || '').trim();
    const password = String(req.body.password || '');

    if (!nim || !password) {
      return res.status(400).json({ message: 'NIM dan kata sandi portal wajib diisi' });
    }

    const student = await Student.findByNim(nim);

    if (!student) {
      return res.status(401).json({ message: 'Akun mahasiswa tidak ditemukan' });
    }

    if (student.status !== 'active') {
      return res.status(403).json({ message: 'Akun mahasiswa nonaktif. Hubungi administrator kampus' });
    }

    // Kata sandi portal diverifikasi terhadap hash Argon2id
    const passwordMatch = await PasswordCodec.verifyPassword(student.sso_password_hash, password);
    if (!passwordMatch) {
      return res.status(401).json({ message: 'NIM atau kata sandi portal salah' });
    }

    let user = await User.findByUsername(nim);

    if (!user) {
      const userId = await User.create({
        username: nim,
        email: student.email,
        passwordHash: await PasswordCodec.hashPassword(password),
        accountToken: generateAccountToken(),
        full_name: student.full_name,
        role: 'mahasiswa'
      });
      user = await User.findById(userId);
    } else {
      await User.activateByUsername(nim);
      user = await User.findById(user.id);
    }

    if (!user) {
      return res.status(500).json({ message: 'Gagal memuat akun mahasiswa' });
    }

    await User.recordLoginSuccess(user.id);
    const refreshedUser = await User.findById(user.id);
    const { accessToken, refreshToken } = await authController.issueTokenPair(refreshedUser || user);

    const frontendBase = String(process.env.FRONTEND_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
    // Hanya token yang dikirim via URL; data user diambil lewat /auth/me
    // di sso-callback.html (menghindari data pribadi di URL/history).
    const redirectUrl = `${frontendBase}/sso-callback.html?token=${encodeURIComponent(accessToken)}`;

    res.json({ message: 'Login SSO berhasil', redirectUrl, refreshToken });
  } catch (error) {
    next(error);
  }
};
