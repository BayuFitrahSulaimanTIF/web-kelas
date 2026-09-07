const express = require('express');
const authenticate = require('../middlewares/authenticate');
const { buildUploader, handleUpload } = require('../utils/upload');
const { createRateLimiter } = require('../middlewares/rateLimiter');
const fileUploadLimiter = createRateLimiter({ windowMs: 60*1000, max: 15, name: 'file-upload' });
const fileController = require('../controllers/fileController');
const commentController = require('../controllers/commentController');

const router = express.Router();

const materiUploader = buildUploader('materi');
const projectUploader = buildUploader('project');

function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Fitur ini khusus admin' });
  }
  next();
}

router.use(authenticate);

// Upload (materi khusus admin, lainnya semua role)
router.post('/materi/upload', requireAdmin, fileUploadLimiter, handleUpload(materiUploader), fileController.uploadMateri);
router.post('/project/upload', fileUploadLimiter, handleUpload(projectUploader), fileController.uploadProject);

// Daftar per kelas
router.get('/materi', fileController.listMateri);
router.get('/project', fileController.listProject);

// Buka / unduh (token boleh via ?token= khusus rute ini)
const tokenFromQuery = authenticate.tokenFromQuery;
router.get('/materi/:id', tokenFromQuery, authenticate, fileController.viewMateri);
router.get('/materi/:id/download', tokenFromQuery, authenticate, fileController.downloadMateri);
router.get('/project/:id', tokenFromQuery, authenticate, fileController.viewProject);
router.get('/project/:id/download', tokenFromQuery, authenticate, fileController.downloadProject);

// Hapus (materi admin, project admin/pemilik)
router.delete('/materi/:id', requireAdmin, fileController.deleteMateri);
router.delete('/project/:id', fileController.deleteProject);

// Tugas / UTS / UAS - semua role
['tugas', 'uts', 'uas'].forEach((kind) => {
  const cap = kind.charAt(0).toUpperCase() + kind.slice(1);
  const uploader = buildUploader(kind);
  router.post('/' + kind + '/upload', fileUploadLimiter, handleUpload(uploader), fileController['upload' + cap]);
  router.get('/' + kind, fileController['list' + cap]);
  router.get('/' + kind + '/:id', tokenFromQuery, authenticate, fileController['view' + cap]);
  router.get('/' + kind + '/:id/download', tokenFromQuery, authenticate, fileController['download' + cap]);
  router.delete('/' + kind + '/:id', fileController['delete' + cap]);
});

// Command / diskusi per file (semua role)
router.get('/:kind/:id/comments', commentController.listComments);
router.post('/:kind/:id/comments', commentController.createComment);
router.delete('/:kind/:id/comments/:commentId', commentController.deleteComment);

module.exports = router;
