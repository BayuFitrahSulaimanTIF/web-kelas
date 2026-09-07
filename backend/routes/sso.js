const express = require('express');
const ssoController = require('../controllers/ssoController');
const { createRateLimiter } = require('../middlewares/rateLimiter');

const router = express.Router();

const ssoLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 5, name: 'sso-callback' });

router.get('/authorize', ssoController.authorize);
router.post('/callback', ssoLimiter, ssoController.callback);

module.exports = router;
