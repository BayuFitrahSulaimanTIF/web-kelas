const express = require('express');
const authenticate = require('../middlewares/authenticate');
const communityController = require('../controllers/communityController');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const communityUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 20, name: 'community-upload' });
const communityMsgLimiter = createRateLimiter({ windowMs: 60*1000, max: 30, name: 'community-msg' });

const router = express.Router();

router.use(authenticate);

router.get('/messages', communityController.listMessages);
router.post('/messages', communityMsgLimiter, communityController.sendText);
router.post('/messages/upload', communityUploadLimiter, communityController.uploadMedia);
router.delete('/messages/:id', communityController.deleteMessage);
router.get('/messages/:id/media', authenticate.tokenFromQuery, authenticate, communityController.streamMedia);

module.exports = router;
