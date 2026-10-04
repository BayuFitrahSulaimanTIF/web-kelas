// ===================================================
// ROUTE USER NOTIFICATIONS (lonceng di navbar)
// GET  /api/user-notifications        daftar notifikasi user
// POST /api/user-notifications/read-all
// POST /api/user-notifications/:id/read
// ===================================================

const express = require('express');
const asyncHandler = require('../middlewares/asyncHandler');
const authenticate = require('../middlewares/authenticate');
const UserNotification = require('../models/UserNotification');
const { AppError } = require('../utils/errors');

const router = express.Router();

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const unreadOnly = req.query.unread === '1' || req.query.unread === 'true';
  const notifications = await UserNotification.listByUser(req.user.id, unreadOnly);
  res.json({ notifications });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await UserNotification.markAllRead(req.user.id);
  res.json({ message: 'Semua notifikasi ditandai sudah dibaca' });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw new AppError(400, 'ID notifikasi tidak valid');
  await UserNotification.markRead(id, req.user.id);
  res.json({ message: 'Notifikasi ditandai sudah dibaca' });
}));

module.exports = router;