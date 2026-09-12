const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['OPEN_PDF', 'BOOKMARK_ADDED', 'NOTE_CREATED', 'QUESTION_ASKED', 'UPLOAD_PDF'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  details: {
    type: String
  },
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document'
  },
  documentName: {
    type: String
  },
  pageNumber: {
    type: Number
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

activitySchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('Activity', activitySchema);
