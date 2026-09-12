const express = require('express');
const router = express.Router();
const { compareDocuments } = require('../controllers/comparisonController');
const { protect } = require('../middleware/auth');

router.post('/compare', protect, compareDocuments);

module.exports = router;
