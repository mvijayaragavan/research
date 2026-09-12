const mongoose = require('mongoose');

/**
 * Connect to MongoDB database
 * Uses URI from environment variable MONGODB_URI
 */
const connectDB = async () => {
  const primaryUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/privacyguard';
  try {
    const conn = await mongoose.connect(primaryUri);
    console.log(`[Database] MongoDB Connected successfully: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.warn(`[Database Notice] Primary MongoDB connection failed (${error.message}). Attempting local fallback...`);
    try {
      const localConn = await mongoose.connect('mongodb://localhost:27017/privacyguard');
      console.log(`[Database] Local MongoDB Connected successfully: ${localConn.connection.host}/${localConn.connection.name}`);
    } catch (localErr) {
      console.error(`[Database Error] Local MongoDB connection failed: ${localErr.message}`);
    }
  }
};

module.exports = connectDB;
