const express = require('express');
const googleAuthController = require('../controllers/googleAuthController');
const { createRateLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Batasi percobaan per IP supaya token palsu tidak dipakai membanjiri
// library verifikasi Google.
const googleLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, name: 'google-login' });

router.get('/config', googleAuthController.config);
router.post('/', googleLimiter, googleAuthController.login);

module.exports = router;