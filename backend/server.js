const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Load environment variables from root .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB
connectDB();

// Core Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// Primary API Routes
app.use('/health', require('./routes/health'));
app.use('/api/health', require('./routes/health'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/privacy', require('./routes/privacy'));
app.use('/api/ai', require('./routes/ai'));
app.use('/api/comparison', require('./routes/comparison'));
app.use('/api/reminders', require('./routes/reminders'));

// SPA Fallback Route: Serve index.html for frontend routes like /ask-question, /dashboard, etc.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/health')) {
    return next();
  }
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Global Error Handler
app.use(errorHandler);

const { initScheduler } = require('./utils/scheduler');
const { verifyEmailJSConfig } = require('./services/emailService');

// Start Gateway Server
app.listen(PORT, () => {
  console.log(`===========================================================`);
  console.log(` PrivacyGuard AI - Core Node Gateway Running on port ${PORT}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Gateway Endpoint: http://localhost:${PORT}`);
  console.log(` Health Check: http://localhost:${PORT}/api/health`);
  console.log(`===========================================================`);
  
  // Validate EmailJS API configuration
  verifyEmailJSConfig();

  // Initialize background reminder scheduler
  initScheduler();
});

module.exports = app;
