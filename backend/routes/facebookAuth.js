const express = require('express');
const facebookAuthController = require('../controllers/facebookAuthController');
const { createRateLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

// Batas percobaan supaya dialog Facebook tidak dipakai bots mengikis
// app secret lewat callback yang diulang-ulang.
const limiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, name: 'facebook-oauth' });

router.get('/config', facebookAuthController.config);
router.get('/start', limiter, facebookAuthController.start);
router.get('/callback', limiter, facebookAuthController.callback);

module.exports = router;