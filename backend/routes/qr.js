const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { protect, requireRole } = require('../middleware/auth');
const QRSession = require('../models/QRSession');
const Subject = require('../models/Subject');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

// Helper: sign payload with SHA-256
function signPayload(payload) {
  const str = JSON.stringify(payload);
  // Ensure JWT_SECRET is used for the signature
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret').update(str).digest('hex');
}

// --- GET ACTIVE SESSION ---
router.get('/active/:subjectId', protect, requireRole('teacher'), async (req, res) => {
  try {
    const session = await QRSession.findOne({
      subject: req.params.subjectId,
      teacher: req.user._id,
      isActive: true,
      expiresAt: { $gt: new Date() } // MongoDB handles the timezone comparison here
    }).lean();

    res.json({ success: true, session: session || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- GENERATE QR ---
router.post('/generate', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { subjectId, duration = 15, latitude, longitude } = req.body;
    const subject = await Subject.findOne({ _id: subjectId, teacher: req.user._id });

    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    // Location setup
    const sessionLat = latitude || subject.classroom.latitude;
    const sessionLng = longitude || subject.classroom.longitude;

    // Force expire old sessions
    await QRSession.updateMany({ subject: subjectId, isActive: true }, { isActive: false });

    const sessionId = uuidv4();
    // CRITICAL: Ensure Date math is precise
    const expiresAt = new Date(Date.now() + parseInt(duration) * 60 * 1000);

    const payload = {
      sessionId,
      subjectId: subject._id.toString(),
      teacherId: req.user._id.toString(),
      classroomLat: sessionLat,
      classroomLng: sessionLng,
      expiresAt: expiresAt.toISOString()
    };

    const signature = signPayload(payload);
    const qrCodeData = JSON.stringify({ ...payload, sig: signature });

    const attendanceUrl = `${CLIENT_URL}/scan?session=${encodeURIComponent(sessionId)}`;
    const qrCodeImage = await QRCode.toDataURL(attendanceUrl);

    const session = await QRSession.create({
      sessionId,
      subject: subjectId,
      teacher: req.user._id,
      qrCodeData,
      qrCodeImage,
      expiresAt,
      isActive: true,
      classroom: {
        latitude: sessionLat,
        longitude: sessionLng,
        radius: subject.classroom.radius || 100
      },
      payload
    });

    await Subject.findByIdAndUpdate(subjectId, { $inc: { totalClasses: 1 } });

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- VALIDATE SESSION (For the Student Scan page) ---
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await QRSession.findOne({ sessionId: req.params.sessionId })
      .populate('subject', 'name code classroom')
      .populate('teacher', 'name')
      .lean();

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    // Check if expired using UTC time
    const now = new Date();
    if (new Date(session.expiresAt) < now || !session.isActive) {
      return res.status(410).json({ error: 'QR code has expired or is invalid.' });
    }

    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
