const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { protect, requireRole } = require('../middleware/auth');
const Attendance = require('../models/Attendance');
const QRSession = require('../models/QRSession');
const Subject = require('../models/Subject');

// Haversine formula to calculate distance between two GPS coordinates
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// POST /api/attendance/mark
router.post('/mark', protect, requireRole('student'), async (req, res) => {
  try {
    const { sessionId, latitude, longitude, deviceFingerprint } = req.body;

    if (!sessionId || !latitude || !longitude || !deviceFingerprint) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Find session
    const session = await QRSession.findOne({ sessionId, isActive: true })
      .populate('subject');

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired.' });
    }

    // Check expiry
    if (session.expiresAt < new Date()) {
      session.isActive = false;
      await session.save();
      return res.status(410).json({ error: 'QR code has expired. Please ask your teacher to generate a new one.' });
    }

    // Check if student is enrolled in this subject
    const subject = await Subject.findById(session.subject._id);
    const isEnrolled = subject.students.some(s => s.toString() === req.user._id.toString());
    if (!isEnrolled) {
      return res.status(403).json({ error: 'You are not enrolled in this subject.' });
    }

    // Check geofencing
    const distance = haversineDistance(
      parseFloat(latitude),
      parseFloat(longitude),
      session.classroom.latitude,
      session.classroom.longitude
    );

    if (distance > session.classroom.radius) {
      return res.status(403).json({
        error: `You are too far from the classroom (${Math.round(distance)}m away, max allowed: ${session.classroom.radius}m).`
      });
    }

    // Check for duplicate attendance (same student, same session)
    const existingAttendance = await Attendance.findOne({
      session: session._id,
      student: req.user._id
    });

    if (existingAttendance) {
      return res.status(409).json({ error: 'Attendance already marked for this session.' });
    }

    // Check for device fingerprint abuse (same device, same session)
    const deviceDuplicate = await Attendance.findOne({
      session: session._id,
      deviceFingerprint
    });

    if (deviceDuplicate) {
      return res.status(409).json({ error: 'This device has already been used to mark attendance for this session.' });
    }

    // Mark attendance
    const attendance = await Attendance.create({
      session: session._id,
      subject: session.subject._id,
      student: req.user._id,
      teacher: session.teacher,
      date: new Date(),
      status: 'present',
      location: {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
        distance: Math.round(distance)
      },
      deviceFingerprint,
      ipAddress: req.ip,
      verificationMethod: 'qr_scan'
    });

    // Update session attendance count
    await QRSession.findByIdAndUpdate(session._id, { $inc: { attendanceCount: 1 } });

    res.json({
      success: true,
      message: 'Attendance marked successfully!',
      attendance: {
        subject: session.subject.name,
        date: attendance.date,
        status: attendance.status,
        distance: Math.round(distance)
      }
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Attendance already marked for this session.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// GET /api/attendance/session/:sessionId/students
router.get('/session/:sessionId/students', protect, requireRole('teacher'), async (req, res) => {
  try {
    const session = await QRSession.findOne({
      sessionId: req.params.sessionId,
      teacher: req.user._id
    });

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const records = await Attendance.find({ session: session._id })
      .populate('student', 'name email rollNumber')
      .sort({ createdAt: 1 })
      .lean();

    res.json({
      success: true,
      count: records.length,
      records: records.map(r => ({
        student: r.student,
        status: r.status,
        time: r.createdAt,
        distance: r.location?.distance
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
