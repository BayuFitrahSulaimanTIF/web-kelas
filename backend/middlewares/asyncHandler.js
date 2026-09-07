// ===================================================
// ASYNC HANDLER
// Membungkus handler async agar error otomatis
// diteruskan ke error handler Express.
// ===================================================

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = asyncHandler;
