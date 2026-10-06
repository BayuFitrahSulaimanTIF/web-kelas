const express = require('express');
const authenticate = require('../middlewares/authenticate');
const communityController = require('../controllers/communityController');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const communityUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 20, name: 'community-upload' });
const communityMsgLimiter = createRateLimiter({ windowMs: 60*1000, max: 30, name: 'community-msg' });

const router = express.Router();

// tokenFromQuery WAJIB lebih dulu dari authenticate: <audio>/<img>/<video>
// tidak bisa mengirim header Authorization, jadi token-nya lewat ?token=
// (dipakai frontend saat menyodorkan URL media langsung).
router.use(authenticate.tokenFromQuery, authenticate);

router.get('/messages', communityController.listMessages);
router.post('/messages', communityMsgLimiter, communityController.sendText);
router.post('/messages/upload', communityUploadLimiter, communityController.uploadMedia);
router.delete('/messages/:id', communityController.deleteMessage);
router.get('/messages/:id/media', communityController.streamMedia);

module.exports = router;
