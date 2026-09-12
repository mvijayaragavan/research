const express = require('express');
const router = express.Router();
const { askAI } = require('../controllers/aiController');
const { protect } = require('../middleware/auth');

router.post('/ask', protect, askAI);
router.post('/query', protect, askAI);

module.exports = router;
