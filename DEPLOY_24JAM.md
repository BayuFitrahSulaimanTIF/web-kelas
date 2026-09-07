# Deploy 24 Jam — Laptop Mati Tetap Online

> Lokal `ngrok http 3000` wajib laptop nyala. Mau 24 jam meski laptop mati → deploy ke hosting.

## Opsi A: Render (paling mudah, Free)
1. Push folder `Web Kelas` ke GitHub (buat repo baru).
2. Buka https://dashboard.render.com → New → Blueprint → connect repo → Render baca `render.yaml`.
3. Render akan buat 2 layanan: **web-kelas** (Node) + **web-kelas-db** (MySQL Free).
4. Tunggu build (3-5 menit). Render jalankan `Dockerfile` → `node backend/server.js`.
5. Setelah deploy, Render kasih URL mis. `https://web-kelas.onrender.com`.
6. Import DB: di Render → Database → Connect → `psql`? Untuk MySQL: pakai `mysql` client atau Render Shell:
   ```
   mysql -h $DB_HOST -P $DB_PORT -u $DB_USER -p$DB_PASSWORD $DB_NAME < database/schema.sql
   ```
   (atau `node backend/scripts/init-db.js` jika ada).
7. Buka URL Render → login `admin1 / admin1#2026` tetap sama.
8. Set `CORS_ORIGIN` & `FRONTEND_BASE_URL` di Render → Environment → sudah isi `https://web-kelas.onrender.com` (ganti jika URL beda).

## Opsi B: Railway (MySQL 1 klik)
1. https://railway.app → New Project → Deploy from GitHub.
2. Add Service → Database → MySQL (Railway isi `DB_HOST/PORT/USER/PASSWORD/NAME` otomatis).
3. Service Web → Variables → isi `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `PASSWORD_PEPPER` (Generate), `CORS_ORIGIN=https://<domain>.up.railway.app`, `FRONTEND_BASE_URL=sama`.
4. Deploy → Railway build `Dockerfile`.

## Opsi C: Fly.io / VPS
```
fly launch --dockerfile Dockerfile
fly secrets set JWT_SECRET=... REFRESH_TOKEN_SECRET=... PASSWORD_PEPPER=... DB_HOST=... DB_PORT=3306 DB_USER=... DB_PASSWORD=... DB_NAME=university_class_system CORS_ORIGIN=https://<app>.fly.dev FRONTEND_BASE_URL=https://<app>.fly.dev
fly deploy
```

## Catatan
- Free tier Render/Railway filesystem ephemeral: file `backend/uploads/*` & `library/*` hilang saat restart. Untuk persist: tambah **Disk/Volume** 1GB di dashboard atau ganti ke S3/R2.
- Ngrok tidak perlu lagi. Kalau tetap mau ngrok lokal, pakai `npm run tunnel:bg` (detached) tapi tetap butuh laptop nyala.
- `DB_PORT` sudah diperbaiki (`backend/config/env.js` & `database.js`) agar baca `DB_PORT` dari hosting.

Lokal tetap jalan: `npm start` di `backend/` seperti biasa.
