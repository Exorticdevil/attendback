const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'QRSession',
    required: true
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['present', 'absent', 'late'],
    default: 'present'
  },
  location: {
    latitude: Number,
    longitude: Number,
    distance: Number // distance from classroom in meters
  },
  deviceFingerprint: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String
  },
  verificationMethod: {
    type: String,
    default: 'qr_scan'
  }
}, { timestamps: true });

// Compound index to prevent duplicate attendance per session per student
attendanceSchema.index({ session: 1, student: 1 }, { unique: true });
attendanceSchema.index({ subject: 1, student: 1, date: 1 });

module.exports = mongoose.model('Attendance', attendanceSchema);
