USE university_class_system;

-- =================================================
-- SCHEMA - UNIVERSITY CLASS SYSTEM
-- NON-DESTRUKTIF: skema ini AMAN dijalankan berulang
-- kali (inisialisasi/restart/upgrade). Tidak ada
-- DROP TABLE; semua tabel CREATE IF NOT EXISTS dan
-- seed memakai INSERT IGNORE, sehingga DATA LAMA
-- (termasuk riwayat obrolan community) TETAP ADA.
-- Penyimpanan akun & kata sandi:
--   - password_hash      : hash Argon2id (salt otomatis
--                           dalam hash + PASSWORD_PEPPER
--                           dari .env, TIDAK di database)
--   - account_token      : 15 karakter acak kriptografis
--                           (identifier internal, BUKAN
--                           turunan email/password)
--   - is_active          : boolean status akun
-- Tidak ada "password → ASCII → biner → 15 karakter".
-- Lihat backend/utils/passwordCodec.js & accountToken.js
-- =================================================

-- =================================================
-- USERS (akun aplikasi)
-- password_hash  : Argon2id ($argon2id$v=19$m=19456,p=1,t=2$...)
-- account_token  : random 15 karakter (identifier internal)
-- failed_login_attempts & locked_until : anti brute force
-- =================================================

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  account_token CHAR(15) NOT NULL UNIQUE,
  full_name VARCHAR(100) DEFAULT NULL,
  role ENUM('admin', 'dosen', 'mahasiswa', 'student') NOT NULL DEFAULT 'student',
  managed_course VARCHAR(60) DEFAULT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_login_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until DATETIME DEFAULT NULL,
  last_login_at DATETIME DEFAULT NULL,
  birth_date DATE DEFAULT NULL,
  gender ENUM('male', 'female') DEFAULT NULL,
  bio TEXT DEFAULT NULL,
  avatar VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active)
);

-- =================================================
-- REFRESH TOKENS (hanya hash SHA-256 yang disimpan)
-- Rotasi: token lama dihapus saat dipakai refresh
-- =================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_refresh_tokens_user_id (user_id),
  INDEX idx_refresh_tokens_expires (expires_at)
);

-- =================================================
-- STUDENTS (akun mahasiswa asli, sumber data SSO)
-- sso_password_hash: hash Argon2id kata sandi portal
-- =================================================

CREATE TABLE IF NOT EXISTS students (
  nim VARCHAR(20) PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  program_studi VARCHAR(100) NOT NULL,
  angkatan YEAR DEFAULT NULL,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  sso_password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- =================================================
-- SEED AKUN LOGIN (hash = Argon2id dari kata sandi)
-- Kata sandi akun demo (lih. scripts/generate-seed-hashes.js):
--   admin1#2026, admin2#2026, admin3#2026
--   student1#2026, student2#2026, student3#2026
-- =================================================

INSERT IGNORE INTO users (username, email, password_hash, account_token, full_name, role) VALUES
  ('admin1', 'admin1@kampus.ac.id', '$argon2id$v=19$m=19456,p=1,t=2$0WXVjLRXEyTBVGMfVwlwyw$ReTC8xdccq9pl27+GbHaiXIl1zd8mkoerRTtKPrmaas', 'nz2GwSHbJrAEIH3', 'Admin Satu', 'admin'),
  ('admin2', 'admin2@kampus.ac.id', '$argon2id$v=19$m=19456,p=1,t=2$XzywH3PKyjPnps+H/hcgog$FIf8BD7PUB8ykuY7uNJLrL6jp1gyL8yu6Myh/LvWQRg', '2mQEt0I9Hc9SrH8', 'Admin Dua', 'admin'),
  ('admin3', 'admin3@kampus.ac.id', '$argon2id$v=19$m=19456,p=1,t=2$2DIyAN0xJTk4uaHpJG33wQ$0qIGwvu9zPZNp+sai+CVOn1eRB4wKu/Mt//CbuwoXjg', 'HhWqxp6I9UUgyRC', 'Admin Tiga', 'admin'),
  ('student1', 'student1@student.kampus.ac.id', '$argon2id$v=19$m=19456,p=1,t=2$89fRpQgxNgHOY97Zxn7Pog$lDfPGurhfZz/2CTxHCuoaUxOTbt9tHAOxKUQGVIj+60', 'eR3IIuEdb196nDj', 'Mahasiswa Satu', 'mahasiswa'),
  ('student2', 'student2@student.kampus.ac.id', '$argon2id$v=19$m=19456,p=1,t=2$KNwTdbg27lKxSA2eXHN6sA$onZBwZ/Pmbt+EMQ3P+k1RbqWbd9CNg6AhEC0TsMw29Y', 'TJZxC6pDBBSX1TR', 'Mahasiswa Dua', 'mahasiswa'),
  ('student3', 'student3@student.kampus.ac.id', '$argon2id$v=19$m=19456,p=1,t=2$w8Cqi7RqhWkuZ2250JaLNg$mfgNqATXUTuRB6XK4s2j57/hC75cnPoQrVvPDNVND9A', 'rEIUryxWeeliOKk', 'Mahasiswa Tiga', 'mahasiswa');
-- =================================================
-- MATERIALS (file materi tiap kelas, khusus admin)
-- =================================================

CREATE TABLE IF NOT EXISTS materials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas CHAR(1) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  description TEXT,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_materials_kelas (kelas),
  INDEX idx_materials_uploaded_by (uploaded_by)
);

-- =================================================
-- PROJECTS (kumpulan kode/tugas project tiap kelas)
-- =================================================

CREATE TABLE IF NOT EXISTS projects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas CHAR(1) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  description TEXT,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_projects_kelas (kelas),
  INDEX idx_projects_uploaded_by (uploaded_by)
);

-- =================================================
-- TUGAS / UTS / UAS (file per kelas, semua role)
-- =================================================

CREATE TABLE IF NOT EXISTS tugas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas CHAR(1) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  description TEXT,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_tugas_kelas (kelas),
  INDEX idx_tugas_uploaded_by (uploaded_by)
);

CREATE TABLE IF NOT EXISTS uts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas CHAR(1) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  description TEXT,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_uts_kelas (kelas),
  INDEX idx_uts_uploaded_by (uploaded_by)
);

CREATE TABLE IF NOT EXISTS uas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  kelas CHAR(1) NOT NULL,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  size BIGINT UNSIGNED NOT NULL,
  description TEXT,
  uploaded_by INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_uas_kelas (kelas),
  INDEX idx_uas_uploaded_by (uploaded_by)
);

-- =================================================
-- FILE_COMMENTS (diskusi per file, semua role)
-- =================================================

CREATE TABLE IF NOT EXISTS file_comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_kind VARCHAR(10) NOT NULL,
  file_id INT NOT NULL,
  user_id INT NOT NULL,
  content TEXT NOT NULL,
  parent_id INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_file_kind_id (file_kind, file_id),
  INDEX idx_parent (parent_id)
);

-- =================================================
-- FILE_NOTIFICATIONS (pemberitahuan mention @username)
-- =================================================

CREATE TABLE IF NOT EXISTS file_notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  sender_id INT NOT NULL,
  comment_id INT NOT NULL,
  file_kind VARCHAR(10) NOT NULL,
  file_id INT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (comment_id) REFERENCES file_comments(id) ON DELETE CASCADE,
  INDEX idx_notif_user_read (user_id, is_read),
  INDEX idx_notif_comment (comment_id)
);

-- =================================================
-- COMMUNITY_MESSAGES (obrolan community ala WhatsApp)
-- =================================================

CREATE TABLE IF NOT EXISTS community_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type ENUM('text', 'image', 'voice', 'file') NOT NULL DEFAULT 'text',
  content TEXT,
  filename VARCHAR(255) DEFAULT NULL,
  original_name VARCHAR(255) DEFAULT NULL,
  mime_type VARCHAR(120) DEFAULT NULL,
  size BIGINT UNSIGNED DEFAULT 0,
  reply_to INT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (reply_to) REFERENCES community_messages(id) ON DELETE SET NULL,
  INDEX idx_community_created (created_at),
  INDEX idx_community_reply (reply_to)
);

-- Tandai pesan yang sudah dibaca pengguna
CREATE TABLE IF NOT EXISTS community_reads (
  message_id INT NOT NULL,
  user_id INT NOT NULL,
  read_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (message_id, user_id),
  FOREIGN KEY (message_id) REFERENCES community_messages(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =================================================
-- SEED MAHASISWA (kata sandi portal: sso123, hash Argon2id)
-- =================================================

INSERT IGNORE INTO students (nim, full_name, email, program_studi, angkatan, status, sso_password_hash) VALUES
  ('210101001', 'Ahmad Fauzi', 'ahmad.fauzi@student.kampus.ac.id', 'Teknik Informatika', 2021, 'active', '$argon2id$v=19$m=19456,p=1,t=2$yIxeE1Wgu81/ZCi8jWSvGQ$WPL38wfaThRp4BWoN7yxyURFQHo4l2CuMEW2uOex9PM'),
  ('210101002', 'Budi Santoso', 'budi.santoso@student.kampus.ac.id', 'Sistem Informasi', 2021, 'active', '$argon2id$v=19$m=19456,p=1,t=2$VPLM+i46iB81wjNS3P03HQ$NicjfbKys4zqNajbrWfiJmwpB8bgZNM3pg9ZdONUS5s'),
  ('220202001', 'Citra Lestari', 'citra.lestari@student.kampus.ac.id', 'Manajemen', 2022, 'active', '$argon2id$v=19$m=19456,p=1,t=2$dRd6GelKmwIJQVea5iQwqQ$YvbRhzbu8JWidUJyDIFG8yHzhkvjbdCcFM4bE5KGFAo'),
  ('230303001', 'Dewi Anggraini', 'dewi.anggraini@student.kampus.ac.id', 'Teknik Elektro', 2023, 'active', '$argon2id$v=19$m=19456,p=1,t=2$RsibidyOISpu0qYDsSl0wg$iLwu5vDv7TLzSen5J8TGQX03D7gev8PnXSv2mpJo2Jw'),
  ('230303002', 'Eko Prasetyo', 'eko.prasetyo@student.kampus.ac.id', 'Akuntansi', 2023, 'inactive', '$argon2id$v=19$m=19456,p=1,t=2$IoQo+kXjUtqNXJE4pLjpHA$EX0A233qU0pqLazIvT2hJGKbg4L08KKLVpHr5IkujCU');
