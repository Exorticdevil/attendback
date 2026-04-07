const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  semester: {
    type: Number,
    required: true
  },
  department: {
    type: String,
    default: 'Computer Science'
  },
  totalClasses: {
    type: Number,
    default: 0
  },
  classroom: {
    latitude: { type: Number, default: 22.5726 },  // Default: Kolkata
    longitude: { type: Number, default: 88.3639 },
    radius: { type: Number, default: 100 } // meters
  },
  color: {
    type: String,
    default: '#6366f1'
  },
  schedule: [{
    day: String,
    startTime: String,
    endTime: String
  }]
}, { timestamps: true });

module.exports = mongoose.model('Subject', subjectSchema);
