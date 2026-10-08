const express = require('express');
const authenticate = require('../middlewares/authenticate');
const usersController = require('../controllers/usersController');

const router = express.Router();

router.use(authenticate);

router.get('/mentions', usersController.listMentions);
router.get('/students', usersController.listStudents);
router.post('/presence', usersController.touchPresence);

module.exports = router;
