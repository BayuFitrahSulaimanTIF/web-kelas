# Database - University Class System

Skema database MySQL untuk University Class System.

## Cara Menjalankan

```bash
mysql -u root -p < database.sql
mysql -u root -p < schema.sql
```

- `database.sql` - Membuat database `university_class_system`
- `schema.sql` - Membuat tabel `users` dan `refresh_tokens`
- Tabel `users` sudah memiliki kolom `role`, `status`, dan `last_login_at` untuk kebutuhan auth login.

Sesuaikan kredensial MySQL di `.env` pada folder `../backend` agar sesuai dengan konfigurasi lokal.
