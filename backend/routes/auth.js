const express = require('express');
const authController = require('../controllers/authController');
const authenticate = require('../middlewares/authenticate');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const { avatarUploader } = require('../utils/avatarUpload');

const router = express.Router();

const loginLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 5, name: 'login' });
const registerLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, name: 'register' });
const resetLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 3, name: 'reset-password' });
const checkLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 10, name: 'check-identifier' });
const refreshLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20, name: 'refresh' });

router.post('/login', loginLimiter, authController.login);
router.post('/register', registerLimiter, authController.register);
router.post('/reset-password', resetLimiter, authController.resetPassword);
router.post('/check-identifier', checkLimiter, authController.checkIdentifier);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/refresh', refreshLimiter, authController.refresh);
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.me);
router.put('/profile', authenticate, authController.updateProfile);

// Upload foto profil (jpg/jpeg/png, maks 5 MB) — hasil crop dari klien
router.post('/avatar', authenticate, (req, res, next) => {
  avatarUploader.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: 'Ukuran foto maksimal 5 MB' });
      }
      return res.status(400).json({ message: err.message || 'Gagal mengunggah foto profil' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'File foto wajib diunggah' });
    }
    try{
      const fs=require('fs');
      const buf=Buffer.alloc(8);
      const fd=fs.openSync(req.file.path,'r');
      const n=fs.readSync(fd,buf,0,8,0);
      fs.closeSync(fd);
      const h=buf.toString('hex').toLowerCase();
      const ok = n>=4 && (h.startsWith('ffd8ff') || h.startsWith('89504e47'));
      if(!ok){ try{fs.unlinkSync(req.file.path);}catch{}; return res.status(400).json({message:'Isi foto tidak sesuai tipe jpg/png (kemungkinan malware)'}); }
    }catch(e){ try{require('fs').unlinkSync(req.file.path);}catch{}; return res.status(400).json({message:'Gagal validasi foto'}); }
    authController.uploadAvatar(req, res, next);
  });
});

// Hapus foto profil (kembali ke inisial nama)
router.delete('/avatar', authenticate, authController.deleteAvatar);

module.exports = router;
