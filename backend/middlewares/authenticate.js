// ===================================================
// AUTHENTICATE
// Memverifikasi access token JWT pada header Authorization
// ===================================================

const { env } = require('../config/env');
const { verifyToken } = require('../utils/jwt');

module.exports = (req, res, next) => {
  const header = req.headers.authorization || '';

  let token = null;
  if (header.startsWith('Bearer ')) {
    token = header.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({ message: 'Token tidak ditemukan' });
  }

  try {
    const decoded = verifyToken(token, env.jwt.secret);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Token tidak valid atau kadaluarsa' });
  }
};

// Khusus rute Buka/Unduh file: token boleh dikirim via ?token= (browser
// tidak bisa mengirim header saat membuka link langsung). Token di query
// dipindahkan ke header agar middleware authenticate tetap satu jalur.
module.exports.tokenFromQuery = (req, res, next) => {
  if (!req.headers.authorization && typeof req.query.token === 'string' && req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  next();
};
