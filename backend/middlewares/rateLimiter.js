// ===================================================
// RATE LIMITER (in-memory, sliding window)
// Membatasi jumlah request per kunci (biasanya IP)
// dalam jendela waktu tertentu. Melindungi endpoint
// login/registrasi dari brute force & spam.
// ===================================================

const logger = require('../utils/logger');

function createRateLimiter({ windowMs, max, name }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    let cleaned = false;
    hits.forEach((timestamps, key) => {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (fresh.length === 0) {
        hits.delete(key);
        cleaned = true;
      } else {
        hits.set(key, fresh);
      }
    });
    if (cleaned) {
      logger.info(`Rate limiter "${name}": bersihkan kunci kedaluwarsa`);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = `${req.ip}:${name}`;
    const now = Date.now();

    const timestamps = (hits.get(key) || []).filter((t) => now - t < windowMs);

    if (timestamps.length >= max) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        message: 'Terlalu banyak percobaan. Silakan coba lagi beberapa saat'
      });
    }

    timestamps.push(now);
    hits.set(key, timestamps);
    next();
  };
}

module.exports = { createRateLimiter };
