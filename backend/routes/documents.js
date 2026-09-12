const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { protect } = require('../middleware/auth');
const {
  uploadDocument,
  getDocuments,
  getDocumentById,
  deleteDocument,
  updateReadingProgress,
  addBookmark,
  deleteBookmark,
  addNote,
  deleteNote,
  getDashboardStats,
  globalSearch,
  downloadDocumentFile
} = require('../controllers/documentController');

router.post('/upload', protect, (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) return next(err);
    if (req.files && req.files.length > 0) {
      req.file = req.files[0];
    }
    next();
  });
}, uploadDocument);

router.get('/', protect, getDocuments);
router.get('/dashboard-stats', protect, getDashboardStats);
router.get('/search', protect, globalSearch);
router.get('/:id', protect, getDocumentById);
router.get('/:id/file', protect, downloadDocumentFile);
router.delete('/:id', protect, deleteDocument);
router.put('/:id/progress', protect, updateReadingProgress);
router.post('/:id/bookmarks', protect, addBookmark);
router.delete('/:id/bookmarks/:bookmarkId', protect, deleteBookmark);
router.post('/:id/notes', protect, addNote);
router.delete('/:id/notes/:noteId', protect, deleteNote);

module.exports = router;
