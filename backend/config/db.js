const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * Uses URI from environment variable MONGODB_URI
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/privacyguard');
    console.log(`[Database] MongoDB Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`[Database Error] Connection failed: ${error.message}`);
    // Non-fatal warning log for local development if MongoDB service isn't started yet
    console.warn('[Database Notice] Ensure local MongoDB instance is running at mongodb://localhost:27017');
  }
};

module.exports = connectDB;
