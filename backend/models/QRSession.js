const mongoose = require('mongoose');

const qrSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  qrCodeData: {
    type: String,
    required: true
  },
  qrCodeImage: {
    type: String // base64 PNG
  },
  expiresAt: {
    type: Date,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  classroom: {
    latitude: Number,
    longitude: Number,
    radius: { type: Number, default: 100 }
  },
  payload: {
    type: Object // signed payload hash
  },
  classDate: {
    type: Date,
    default: Date.now
  },
  attendanceCount: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

// Auto-expire sessions
qrSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('QRSession', qrSessionSchema);
