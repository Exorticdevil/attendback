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
    const { subjectId, duration = 15 } = req.body;

    if (!subjectId) return res.status(400).json({ error: 'Subject ID is required.' });

    const subject = await Subject.findOne({ _id: subjectId, teacher: req.user._id });
    if (!subject) return res.status(404).json({ error: 'Subject not found or unauthorized.' });

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
      classroomLat: subject.classroom.latitude,
      classroomLng: subject.classroom.longitude,
      classroomRadius: subject.classroom.radius,
      expiresAt: expiresAt.toISOString(),
      issuedAt: new Date().toISOString()
    };

    const signature = signPayload(payload);
    const qrData = JSON.stringify({ ...payload, sig: signature });

    // Generate QR code URL (student scans → goes to attendance page)
    const attendanceUrl = `${CLIENT_URL}/scan?session=${encodeURIComponent(sessionId)}`;

    // Generate QR image
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
        latitude: subject.classroom.latitude,
        longitude: subject.classroom.longitude,
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

// GET /api/qr/session/:sessionId - validate session
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await QRSession.findOne({ sessionId: req.params.sessionId })
      .populate('subject', 'name code color classroom')
      .populate('teacher', 'name')
      .lean();

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const now = new Date();
    if (session.expiresAt < now) {
      return res.status(410).json({ error: 'QR code has expired.' });
    }

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        subject: session.subject,
        teacher: session.teacher,
        expiresAt: session.expiresAt,
        classroom: session.classroom,
        isActive: session.isActive
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/qr/active/:subjectId - check active session for teacher
router.get('/active/:subjectId', protect, requireRole('teacher'), async (req, res) => {
  try {
    const session = await QRSession.findOne({
      subject: req.params.subjectId,
      teacher: req.user._id,
      isActive: true,
      expiresAt: { $gt: new Date() }
    }).lean();

    if (!session) return res.json({ success: true, session: null });

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        qrCodeImage: session.qrCodeImage,
        expiresAt: session.expiresAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/qr/invalidate/:sessionId
router.delete('/invalidate/:sessionId', protect, requireRole('teacher'), async (req, res) => {
  try {
    await QRSession.findOneAndUpdate(
      { sessionId: req.params.sessionId, teacher: req.user._id },
      { isActive: false }
    );
    res.json({ success: true, message: 'Session invalidated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
