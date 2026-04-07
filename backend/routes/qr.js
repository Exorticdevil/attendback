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
  return crypto.createHmac('sha256', process.env.JWT_SECRET).update(str).digest('hex');
}

// POST /api/qr/generate
router.post('/generate', protect, requireRole('teacher'), async (req, res) => {
  try {
    // 1. Get latitude and longitude from the request body (sent by the frontend)
    const { subjectId, duration = 15, latitude, longitude } = req.body;

    if (!subjectId) return res.status(400).json({ error: 'Subject ID is required.' });

    const subject = await Subject.findOne({ _id: subjectId, teacher: req.user._id });
    if (!subject) return res.status(404).json({ error: 'Subject not found or unauthorized.' });

    // 2. Determine the reference point: Use Teacher's LIVE location, fallback to Subject default
    const sessionLat = latitude || subject.classroom.latitude;
    const sessionLng = longitude || subject.classroom.longitude;

    // Expire any previous active sessions for this subject
    await QRSession.updateMany(
      { subject: subjectId, isActive: true },
      { isActive: false }
    );

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    const payload = {
      sessionId,
      subjectId: subject._id.toString(),
      teacherId: req.user._id.toString(),
      subjectCode: subject.code,
      // 3. Include the LIVE location in the payload for the student to verify against
      classroomLat: sessionLat,
      classroomLng: sessionLng,
      classroomRadius: subject.classroom.radius,
      expiresAt: expiresAt.toISOString(),
      issuedAt: new Date().toISOString()
    };

    const signature = signPayload(payload);
    const qrData = JSON.stringify({ ...payload, sig: signature });

    const attendanceUrl = `${CLIENT_URL}/scan?session=${encodeURIComponent(sessionId)}`;

    const qrCodeImage = await QRCode.toDataURL(attendanceUrl, {
      width: 512,
      margin: 2,
      color: { dark: '#1e1b4b', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    });

    const session = await QRSession.create({
      sessionId,
      subject: subject._id,
      teacher: req.user._id,
      qrCodeData: qrData,
      qrCodeImage,
      expiresAt,
      isActive: true,
      classroom: {
        // 4. Save the LIVE teacher location in the session database
        latitude: sessionLat,
        longitude: sessionLng,
        radius: subject.classroom.radius
      },
      payload,
      classDate: new Date()
    });

    // Increment totalClasses for subject
    await Subject.findByIdAndUpdate(subjectId, { $inc: { totalClasses: 1 } });

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        qrCodeImage: session.qrCodeImage,
        expiresAt: session.expiresAt,
        subject: { name: subject.name, code: subject.code }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ... (Rest of the GET and DELETE routes remain the same)
// They already use session.classroom which now contains the live location!

module.exports = router;
