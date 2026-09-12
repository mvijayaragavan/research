const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Document',
      default: null
    },
    documentName: {
      type: String,
      default: null
    },
    type: {
      type: String,
      enum: ['AUTOMATIC', 'MANUAL'],
      default: 'MANUAL'
    },
    eventType: {
      type: String,
      enum: [
        'CONTRACT_EXPIRY',
        'CONTRACT_RENEWAL',
        'PAYMENT_DUE',
        'APPLICATION_DEADLINE',
        'SUBSCRIPTION_RENEWAL',
        'DOCUMENT_REVIEW',
        'EXAM_DATE',
        'MEETING_DATE',
        'CUSTOM'
      ],
      default: 'CUSTOM'
    },
    title: {
      type: String,
      required: true
    },
    eventDate: {
      type: Date,
      required: true
    },
    eventTime: {
      type: String,
      default: null
    },
    description: {
      type: String,
      default: null
    },
    noticeDays: {
      type: Number,
      default: 7
    },
    reminderDate: {
      type: Date,
      required: true
    },
    reminderTime: {
      type: String,
      default: null
    },
    pageNumber: {
      type: Number,
      default: null
    },
    evidence: {
      type: String,
      default: null
    },
    confidence: {
      type: Number,
      default: null
    },
    emailEnabled: {
      type: Boolean,
      default: true
    },
    emailStatus: {
      type: String,
      enum: ['PENDING', 'SENT', 'FAILED'],
      default: 'PENDING'
    },
    emailSentAt: {
      type: Date,
      default: null
    },
    emailError: {
      type: String,
      default: null
    },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'DISMISSED', 'ACTIVE', 'CANCELLED'],
      default: 'PENDING'
    }
  },
  {
    timestamps: true
  }
);

// Pre-save hook to ensure owner and userId stay synchronized
reminderSchema.pre('save', function (next) {
  if (this.owner && !this.userId) {
    this.userId = this.owner;
  } else if (this.userId && !this.owner) {
    this.owner = this.userId;
  }
  next();
});

module.exports = mongoose.model('Reminder', reminderSchema);

