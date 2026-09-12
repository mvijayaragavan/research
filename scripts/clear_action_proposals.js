const path = require('path');
const mongoose = require(path.join(__dirname, '../backend/node_modules/mongoose'));
const dotenv = require(path.join(__dirname, '../backend/node_modules/dotenv'));

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/privacyguard';

async function clearProposals() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB:', MONGO_URI);

    const db = mongoose.connection.db;
    const result = await db.collection('actionproposals').deleteMany({});
    console.log(`Successfully deleted ${result.deletedCount} action proposal(s). Queue is now empty!`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error clearing proposals:', err);
    process.exit(1);
  }
}

clearProposals();
