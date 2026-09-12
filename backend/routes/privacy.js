const express = require('express');
const router = express.Router();
const { analyzeText, sanitizeTextEndpoint, minimizeDataEndpoint } = require('../controllers/privacyController');
const { protect } = require('../utils/jwt');

// Optional protect middleware so unauthenticated users can test preview in UI
router.post('/analyze', analyzeText);
router.post('/sanitize', sanitizeTextEndpoint);
router.post('/minimize', minimizeDataEndpoint);

module.exports = router;
