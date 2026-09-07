// ===================================================
// CONTROLLER FILE NOTIFICATIONS (mention @username)
// ===================================================

const asyncHandler = require('../middlewares/asyncHandler');
const FileNotification = require('../models/FileNotification');
const { AppError } = require('../utils/errors');

exports.listNotifications = asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const notifications = await FileNotification.listByUser(req.user.id, unreadOnly);
  res.json({ notifications });
});

exports.markRead = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    throw new AppError(400, 'ID notifikasi tidak valid');
  }
  await FileNotification.markRead(id, req.user.id);
  res.json({ message: 'Notifikasi ditandai sudah dibaca' });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await FileNotification.markAllRead(req.user.id);
  res.json({ message: 'Semua notifikasi ditandai sudah dibaca' });
});
