const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Document title is required'],
    trim: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    default: 'application/pdf'
  },
  pdfBuffer: {
    type: Buffer,
    select: false
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  classification: {
    type: String,
    enum: ['PUBLIC', 'INTERNAL', 'CONFIDENTIAL', 'HIGHLY_SENSITIVE'],
    default: 'CONFIDENTIAL'
  },
  sensitiveEntitiesDetected: [{
    entityType: { type: String }, // e.g. PERSON, PHONE, GOVT_ID, BANK_ACC, POLICY_NO
    originalValue: { type: String, select: false }, // Hidden by default for privacy
    placeholder: { type: String }, // e.g. [PERSON_1], [PHONE_1]
    confidence: { type: Number, default: 0.95 }
  }],
  totalEntitiesCount: {
    type: Number,
    default: 0
  },
  rawText: {
    type: String,
    required: true
  },
  minimizedText: {
    type: String
  },
  totalPages: {
    type: Number,
    default: 1
  },
  lastPageRead: {
    type: Number,
    default: 1
  },
  lastOpenedAt: {
    type: Date,
    default: Date.now
  },
  bookmarks: [{
    pageNumber: { type: Number, required: true },
    title: { type: String, default: 'Bookmark' },
    createdAt: { type: Date, default: Date.now }
  }],
  notes: [{
    pageNumber: { type: Number, required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for fast lookup by owner and classification
documentSchema.index({ owner: 1, classification: 1 });

module.exports = mongoose.model('Document', documentSchema);
