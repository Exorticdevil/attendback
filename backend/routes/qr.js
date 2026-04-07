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
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'secret').update(str).digest('hex');
}

// POST /api/qr/generate
router.post('/generate', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { subjectId, duration = 15, latitude, longitude } = req.body;

    if (!subjectId) return res.status(400).json({ error: 'Subject ID is required.' });

    const subject = await Subject.findOne({ _id: subjectId, teacher: req.user._id });
    if (!subject) return res.status(404).json({ error: 'Subject not found or unauthorized.' });

    // 1. Determine Location (Live vs Database fallback)
    const sessionLat = latitude || subject.classroom.latitude;
    const sessionLng = longitude || subject.classroom.longitude;

    // Expire any previous active sessions for this subject
    await QRSession.updateMany(
      { subject: subjectId, isActive: true },
      { isActive: false }
    );

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + duration * 60 * 1000);

    // 2. Create the Payload
    const payload = {
      sessionId,
      subjectId: subject._id.toString(),
      teacherId: req.user._id.toString(),
      subjectCode: subject.code,
      classroomLat: sessionLat,
      classroomLng: sessionLng,
      classroomRadius: subject.classroom.radius || 100,
      expiresAt: expiresAt.toISOString(),
      issuedAt: new Date().toISOString()
    };

    // 3. Generate Signature and the REQUIRED qrCodeData string
    const signature = signPayload(payload);
    const qrCodeData = JSON.stringify({ ...payload, sig: signature }); 

    // 4. Generate QR image
    const attendanceUrl = `${CLIENT_URL}/scan?session=${encodeURIComponent(sessionId)}`;
    const qrCodeImage = await QRCode.toDataURL(attendanceUrl, {
      width: 512,
      margin: 2,
      color: { dark: '#1e1b4b', light: '#ffffff' },
      errorCorrectionLevel: 'H'
    });

    // 5. Create the Session using the exact schema fields
    const session = await QRSession.create({
      sessionId,
      subject: subject._id,
      teacher: req.user._id,
      qrCodeData,       // Matches your required schema field
      qrCodeImage,      // Matches your schema
      expiresAt,        // Matches your schema
      isActive: true,
      classroom: {
        latitude: sessionLat,
        longitude: sessionLng,
        radius: subject.classroom.radius || 100
      },
      payload,          // Stores the object as per your schema
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
    console.error("QR Error:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
