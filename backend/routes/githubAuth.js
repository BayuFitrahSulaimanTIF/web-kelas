const express = require('express');
const githubAuthController = require('../controllers/githubAuthController');

const router = express.Router();

router.get('/config', githubAuthController.config);
router.get('/start', githubAuthController.start);
router.get('/callback', githubAuthController.callback);

module.exports = router;