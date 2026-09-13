const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

/**
 * GET /api/health
 * Basic server & subsystem health check
 */
router.get('/', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'CONNECTED' : 'DISCONNECTED';

  res.status(200).json({
    status: 'ONLINE',
    service: 'ReadDocX Node Backend Gateway',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      name: mongoose.connection.name || 'privacyguard'
    },
    version: '1.0.0'
  });
});

module.exports = router;
