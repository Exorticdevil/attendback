const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { protect, requireRole } = require('../middleware/auth');
const QRSession = require('../models/QRSession');
const Subject = require('../models/Subject');

// POST /api/qr/generate
router.post('/generate', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { subjectId, duration = 15, latitude, longitude } = req.body;
    const subject = await Subject.findOne({ _id: subjectId, teacher: req.user._id });

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    // Use Teacher's Live Location, fallback to subject default if coords missing
    const sessionLat = latitude || subject.classroom.latitude;
    const sessionLng = longitude || subject.classroom.longitude;

    await QRSession.updateMany({ subject: subjectId, isActive: true }, { isActive: false });

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);
    const qrCodeImage = await QRCode.toDataURL(`${process.env.CLIENT_URL}/scan?session=${sessionId}`);

    const session = await QRSession.create({
      sessionId,
      subject: subjectId,
      teacher: req.user._id,
      qrCodeImage,
      expiresAt,
      isActive: true,
      classroom: {
        latitude: sessionLat,
        longitude: sessionLng,
        radius: subject.classroom.radius
      }
    });

    await Subject.findByIdAndUpdate(subjectId, { $inc: { totalClasses: 1 } });
    res.json({ success: true, session });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qr/active/:subjectId
router.get('/active/:subjectId', protect, requireRole('teacher'), async (req, res) => {
  try {
    const session = await QRSession.findOne({
      subject: req.params.subjectId,
      teacher: req.user._id,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).lean();

    // Fix: Return null if no session, not a 404 error
    res.json({ success: true, session: session || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
