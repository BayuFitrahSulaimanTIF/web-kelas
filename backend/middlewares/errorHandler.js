// ===================================================
// ERROR HANDLER
// 404 untuk route tidak ditemukan + handler terpusat
// untuk semua error (AppError, error JSON, error DB)
// ===================================================

const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const { env } = require('../config/env');

const dbErrorCodes = new Set([
  'ECONNREFUSED',
  'ETIMEDOUT',
  'PROTOCOL_CONNECTION_LOST',
  'ER_ACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
  'ER_NO_SUCH_TABLE',
  'ER_NO_DB_ERROR'
]);

function notFoundHandler(req, res, next) {
  next(new AppError(404, 'Route tidak ditemukan'));
}

function errorHandler(err, req, res, next) {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ message: 'Format JSON body tidak valid' });
  }

  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ message: 'Ukuran body melebihi batas yang diizinkan' });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      message: err.message,
      ...(err.details ? { errors: err.details } : {})
    });
  }

  if (err && dbErrorCodes.has(err.code)) {
    logger.error(`Database error (${err.code}):`, err.message);
    return res.status(503).json({
      message: 'Database tidak dapat dihubungi. Pastikan MySQL berjalan dan skema database sudah diimport'
    });
  }

  logger.error('Unhandled error:', err);
  return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
}

module.exports = { notFoundHandler, errorHandler };
