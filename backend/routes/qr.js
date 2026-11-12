const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { protect, requireRole } = require('../middleware/auth');
const supabase = require('../config/supabase');

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

function signPayload(payload) {
  const str = JSON.stringify(payload);
  return crypto.createHmac('sha256', process.env.JWT_SECRET || 'fallback_secret').update(str).digest('hex');
}

function formatSession(s, subjectObj = null, teacherObj = null) {
  return {
    _id: s.id,
    sessionId: s.session_id,
    subject: subjectObj || s.subject_id,
    teacher: teacherObj || s.teacher_id,
    qrCodeData: s.qr_code_data,
    qrCodeImage: s.qr_code_image,
    expiresAt: s.expires_at,
    isActive: s.is_active,
    classroom: {
      latitude: s.classroom_lat,
      longitude: s.classroom_lng,
      radius: s.classroom_radius
    },
    payload: s.payload,
    classDate: s.class_date,
    attendanceCount: s.attendance_count
  };
}

router.get('/active/:subjectId', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { data: session } = await supabase
      .from('qr_sessions')
      .select('*')
      .eq('subject_id', req.params.subjectId)
      .eq('teacher_id', req.user.id)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    res.json({ success: true, session: session ? formatSession(session) : null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { subjectId, duration = 15, latitude, longitude } = req.body;

    const { data: subject } = await supabase
      .from('subjects')
      .select('*')
      .eq('id', subjectId)
      .eq('teacher_id', req.user.id)
      .single();

    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const sessionLat = latitude || subject.classroom_lat;
    const sessionLng = longitude || subject.classroom_lng;

    // Deactivate previous active sessions for this subject
    await supabase
      .from('qr_sessions')
      .update({ is_active: false })
      .eq('subject_id', subjectId)
      .eq('is_active', true);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + parseInt(duration) * 60 * 1000);

    const payload = {
      sessionId,
      subjectId: subject.id,
      teacherId: req.user.id,
      classroomLat: sessionLat,
      classroomLng: sessionLng,
      expiresAt: expiresAt.toISOString()
    };

    const signature = signPayload(payload);
    const qrCodeData = JSON.stringify({ ...payload, sig: signature });

    const attendanceUrl = `${CLIENT_URL}/scan?session=${encodeURIComponent(sessionId)}`;
    const qrCodeImage = await QRCode.toDataURL(attendanceUrl);

    const { data: session, error } = await supabase
      .from('qr_sessions')
      .insert({
        session_id: sessionId,
        subject_id: subjectId,
        teacher_id: req.user.id,
        qr_code_data: qrCodeData,
        qr_code_image: qrCodeImage,
        expires_at: expiresAt.toISOString(),
        is_active: true,
        classroom_lat: sessionLat,
        classroom_lng: sessionLng,
        classroom_radius: subject.classroom_radius || 100,
        payload
      })
      .select()
      .single();

    if (error) throw error;

    await supabase.rpc('increment_subject_classes', { row_id: subjectId });

    res.json({ success: true, session: formatSession(session) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const { data: session } = await supabase
      .from('qr_sessions')
      .select(`
        *,
        subjects (id, name, code, classroom_lat, classroom_lng, classroom_radius),
        users!qr_sessions_teacher_id_fkey (name)
      `)
      .eq('session_id', req.params.sessionId)
      .single();

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    if (new Date(session.expires_at) < new Date() || !session.is_active) {
      return res.status(410).json({ error: 'QR code has expired or is invalid.' });
    }

    const formatted = formatSession(
      session,
      {
        _id: session.subjects.id,
        name: session.subjects.name,
        code: session.subjects.code,
        classroom: {
          latitude: session.subjects.classroom_lat,
          longitude: session.subjects.classroom_lng,
          radius: session.subjects.classroom_radius
        }
      },
      { name: session.users.name }
    );

    res.json({ success: true, session: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
