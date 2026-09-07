// ===================================================
// REQUEST LOGGER
// Mencatat method, path, status, dan durasi tiap request
// ===================================================

const logger = require('../utils/logger');

module.exports = (req, res, next) => {
  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
    logger.info(`${req.method} ${req.path} -> ${res.statusCode} (${durationMs.toFixed(1)}ms)`);
  });

  next();
};
