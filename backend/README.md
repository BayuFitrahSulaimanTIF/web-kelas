# Backend - University Class System

Backend API (Express + MySQL) untuk University Class System.

## Struktur

```
backend/
├── server.js              Entry point server
├── app.js                 Konfigurasi aplikasi Express
├── config/
│   ├── database.js        Koneksi MySQL (mysql2 pool)
│   └── env.js             Konfigurasi terpusat dari .env
├── controllers/
│   ├── authController.js  Login, register, reset/change password, refresh, logout
│   ├── usersController.js Daftar user
│   ├── fileController.js  Unggah file kelas (materi)
│   ├── notificationController.js  Notifikasi
│   ├── communityController.js     Forum komunitas
│   ├── commentController.js       Komentar file
│   └── ssoController.js   SSO mahasiswa (login otomatis via NIM)
├── middlewares/
│   ├── authenticate.js    Verifikasi JWT (access token)
│   ├── asyncHandler.js    Pembungkus async error
│   ├── errorHandler.js    404 + error terpusat
│   ├── rateLimiter.js     Rate limit per endpoint
│   └── requestLogger.js   Log permintaan
├── models/                Query DB per tabel (User, RefreshToken, Student, dll.)
├── routes/                Router per resource (auth, sso, files, users, notifications, community)
├── utils/                 passwordCodec, jwt, upload, logger, errors
├── validators/            Validasi payload (authValidators.js)
└── scripts/               Skrip migrasi one-off (alterUsers.js)
```

## Endpoint

| Method | Path | Keterangan |
| ------ | ---- | ---------- |
| GET | `/api/health` | Cek status API + koneksi DB |
| POST | `/api/auth/register` | Daftar akun (email, birth_date dd/mm/yyyy, gender, password) |
| POST | `/api/auth/login` | Login dengan username/email + password (ada lockout) |
| GET | `/api/auth/me` | Profil user dari access token |
| POST | `/api/auth/refresh` | Rotasi refresh token |
| POST | `/api/auth/reset-password` | Reset kata sandi (tanpa token) |
| POST | `/api/auth/change-password` | Ganti kata sandi (wajib token) |
| POST | `/api/auth/logout` | Logout (wajib token) |
| POST | `/api/auth/sso/*` | SSO mahasiswa |
| `/api/files`, `/api/users`, `/api/notifications`, `/api/community` | Resource lain |

### Catatan registrasi

- `birth_date` format `dd/mm/yyyy` (tahun > 2008 ditolak).
- `gender` hanya `male` | `female`.
- `password` minimal 8 karakter: huruf besar, huruf kecil, angka, dan simbol `!@#$%^&*()`.
- `username` dibuat otomatis (15 karakter acak), `role` = `student`.

## Menjalankan

Semua perintah dijalankan dari folder `backend`:

```bash
cd backend
npm install
npm run dev
```

Buat file `.env` di folder `backend` (lihat contoh di bawah), lalu jalankan skema
database dari folder `../database` terlebih dahulu.

```
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=university_class_system
JWT_SECRET=ganti_dengan_secret_rahasia
JWT_EXPIRES_IN=1d
JWT_REFRESH_EXPIRES_IN=7d
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=5
CORS_ORIGIN=*
FRONTEND_BASE_URL=http://localhost:5000
```

## Catatan

- Frontend halaman login disajikan di `/` (folder `../frontend`).
- Dashboard disajikan di `/dashboard` (folder `../../dashboard`, terpisah dari proyek ini).
