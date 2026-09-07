// ===================================================
// VALIDATOR PAYLOAD
// Mengembalikan object errors (kosong jika valid)
// ===================================================

const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,50}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[!@#$%^&*()]).{8,128}$/;
const ALLOWED_ROLES = ['admin', 'dosen', 'mahasiswa', 'student'];

const normalize = (value) => String(value || '').trim();
const normalizeEmail = (value) => normalize(value).toLowerCase();

function validateLogin(payload) {
  const errors = {};
  const identifier = normalize(payload.username || payload.email || '');
  const password = String(payload.password || '');

  if (!identifier) errors.identifier = 'Email/username wajib diisi';
  else if (identifier.length > 200) errors.identifier = 'Email/username tidak valid';
  if (!password) errors.password = 'Kata sandi wajib diisi';
  else if (password.length > 500) errors.password = 'Kata sandi terlalu panjang';

  return errors;
}

function validateRegister(payload) {
  const errors = {};
  const username = normalize(payload.username);
  const firstName = normalize(payload.first_name);
  const lastName = normalize(payload.last_name);
  const email = normalizeEmail(payload.email);
  const password = String(payload.password || '');
  const birthDate = normalize(payload.birth_date);
  const gender = normalize(payload.gender);

  if (!username) {
    errors.username = 'Username wajib diisi';
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = 'Username 3-50 karakter (hanya huruf, angka, titik, garis bawah, strip)';
  }

  if (!firstName) {
    errors.first_name = 'Nama depan wajib diisi';
  } else if (firstName.length > 50) {
    errors.first_name = 'Nama depan terlalu panjang';
  }

  if (!lastName) {
    errors.last_name = 'Nama belakang wajib diisi';
  } else if (lastName.length > 50) {
    errors.last_name = 'Nama belakang terlalu panjang';
  }

  if (!email) {
    errors.email = 'Email wajib diisi';
  } else if (!EMAIL_PATTERN.test(email)) {
    errors.email = 'Format email tidak valid';
  }

  if (!birthDate) {
    errors.birth_date = 'Tanggal lahir wajib diisi';
  } else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(birthDate)) {
    errors.birth_date = 'Format tanggal harus dd/mm/yyyy';
  } else {
    const [dd, mm, yyyy] = birthDate.split('/').map(Number);
    const yearInvalid = yyyy < 1900 || yyyy > 2008;
    const monthInvalid = mm < 1 || mm > 12;
    const dayInvalid = dd < 1 || dd > 31;
    if (yearInvalid || monthInvalid || dayInvalid) {
      errors.birth_date = 'Tanggal lahir tidak valid';
    } else {
      // Cek hari nyata dalam bulan (31/04, 29/02 ganjil, dst.)
      const daysInMonth = new Date(yyyy, mm, 0).getDate();
      if (dd > daysInMonth) {
        errors.birth_date = 'Tanggal lahir tidak valid';
      }
    }
  }

  if (!gender) {
    errors.gender = 'Pilih jenis kelamin';
  } else if (!['male', 'female'].includes(gender)) {
    errors.gender = 'Jenis kelamin tidak valid';
  }

  if (!password) {
    errors.password = 'Kata sandi wajib diisi';
  } else if (!PASSWORD_PATTERN.test(password)) {
    errors.password = 'Kata sandi minimal 8 karakter dengan huruf besar, huruf kecil, angka, dan simbol !@#$%^&*()';
  }

  return errors;
}

function validateResetPassword(payload) {
  const errors = {};
  const identifier = normalize(payload.identifier || payload.username || payload.email || '');
  const newPassword = String(payload.newPassword || '');

  if (!identifier) {
    errors.identifier = 'Email/username wajib diisi';
  }

  if (!newPassword) {
    errors.newPassword = 'Kata sandi baru wajib diisi';
  } else if (!PASSWORD_PATTERN.test(newPassword)) {
    errors.newPassword = 'Kata sandi baru minimal 8 karakter dengan huruf besar, huruf kecil, angka, dan simbol !@#$%^&*()';
  }

  return errors;
}

function validateChangePassword(payload) {
  const errors = {};
  const currentPassword = String(payload.currentPassword || '');
  const newPassword = String(payload.newPassword || '');

  if (!currentPassword) {
    errors.currentPassword = 'Kata sandi saat ini wajib diisi';
  }

  if (!newPassword) {
    errors.newPassword = 'Kata sandi baru wajib diisi';
  } else if (!PASSWORD_PATTERN.test(newPassword)) {
    errors.newPassword = 'Kata sandi baru minimal 8 karakter dengan huruf besar, huruf kecil, angka, dan simbol !@#$%^&*()';
  }

  return errors;
}

function validateProfileUpdate(payload) {
  const errors = {};
  const bio = String(payload.bio || '').trim();

  if (bio && Array.from(bio).length > 1700) {
    errors.bio = 'Bio maksimal 1700 karakter';
  }

  return errors;
}

module.exports = {
  validateLogin,
  validateRegister,
  validateResetPassword,
  validateChangePassword,
  validateProfileUpdate
};
