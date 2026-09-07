# Frontend - Login & Daftar Akun

Halaman login + modal "Daftar akun" untuk University Class System.
Disajikan oleh backend di `/` (lihat `backend/app.js`).

## Struktur

```
frontend/
├── index.html            Halaman login + modal lupa sandi + modal reset sandi + modal daftar akun
├── sso-callback.html     Redirect setelah SSO mahasiswa
├── css/
│   ├── reset.css         Reset dasar
│   ├── variables.css     Font + variabel desain (warna, radius, shadow, spacing)
│   ├── layout.css        Kerangka halaman (hero kiri, kartu login kanan)
│   ├── components.css    Komponen bersama: input, tombol, toast, modal (forgot/register)
│   ├── login.css         Gaya spesifik halaman login
│   ├── animation.css     Animasi (press, shake, spinner)
│   └── responsive.css    Breakpoint mobile/tablet
├── js/
│   ├── config.js         APP_CONFIG: API_BASE_URL, kunci storage
│   ├── validation.js     Validasi teks (email, username, password) - shared
│   ├── ui.js             UI helper: toast, loading, field error, pesan
│   ├── animation.js      Helper animasi (pressButton, shake, fokus input)
│   ├── datepicker.js     Panel kalender (pola Fluent UI DatePicker, tanpa
│   │                     dropdown "first day of the week"), output dd/mm/yyyy
│   ├── login.js          Alur login + penyimpanan sesi (local/sessionStorage)
│   ├── forgot-password.js  Modal lupa kata sandi (langkah 1: identifikasi akun)
│   ├── reset-password.js   Modal reset kata sandi (langkah 2: kata sandi baru)
│   └── register.js       Modal daftar akun 3 langkah
└── assets/
    ├── fonts/            Inter + Poppins (woff2)
    └── images/           campus.png (hero), logo-putih.png (brand)
```

## Alur modal "Daftar akun" (register.js)

1. **Email** — validasi format.
2. **Tanggal lahir + jenis kelamin** — tanggal dipilih lewat panel kalender
   (`js/datepicker.js`, klik field untuk membuka; format otomatis `dd/mm/yyyy`,
   tahun > 2008 ditolak saat submit).
3. **Kata sandi + konfirmasi** — minimal 8 karakter (huruf besar, huruf kecil,
   angka, simbol `!@#$%^&*()`); jika konfirmasi tidak sama muncul pesan
   "kata sandi tidak sama".

Sukses → modal tertutup otomatis, akun tersimpan (`role` = `student`, username
otomatis 15 karakter).

## Alur "Lupa kata sandi" (forgot-password.js + reset-password.js)

1. **forgot-password.js** — modal lupa kata sandi meminta email/username; valid,
   simpan ke localStorage (`reset_identifier`) lalu buka modal reset.
2. **reset-password.js** — modal reset menampilkan akun yang dipilih, meminta
   kata sandi baru + konfirmasi (syarat sama dengan daftar akun); sukses
   memanggil `POST /api/auth/reset-password`, menghapus `reset_identifier`,
   lalu menutup modal.

## Menjalankan

Frontend disajikan oleh backend Express. Dari folder `backend`:

```bash
npm run dev
```

Buka `http://localhost:5000`. Tanpa backend, buka `index.html` langsung di
browser (fungsi login/register tidak aktif tanpa API).
