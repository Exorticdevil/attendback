const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const supabase = require('../config/supabase');

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

router.post('/mark', protect, requireRole('student'), async (req, res) => {
  try {
    const { sessionId, latitude, longitude, deviceFingerprint } = req.body;

    if (!sessionId || !latitude || !longitude || !deviceFingerprint) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const { data: session } = await supabase
      .from('qr_sessions')
      .select('*, subjects(id, name)')
      .eq('session_id', sessionId)
      .eq('is_active', true)
      .single();

    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired.' });
    }

    if (new Date(session.expires_at) < new Date()) {
      await supabase.from('qr_sessions').update({ is_active: false }).eq('id', session.id);
      return res.status(410).json({ error: 'QR code has expired. Please ask your teacher to generate a new one.' });
    }

    // Check enrollment
    const { data: enrollment } = await supabase
      .from('subject_students')
      .select('student_id')
      .eq('subject_id', session.subject_id)
      .eq('student_id', req.user.id)
      .maybeSingle();

    if (!enrollment) {
      return res.status(403).json({ error: 'You are not enrolled in this subject.' });
    }

    // Geofence check
    const distance = haversineDistance(
      parseFloat(latitude),
      parseFloat(longitude),
      session.classroom_lat,
      session.classroom_lng
    );

    if (distance > session.classroom_radius) {
      return res.status(403).json({
        error: `You are too far from the classroom (${Math.round(distance)}m away, max allowed: ${session.classroom_radius}m).`
      });
    }

    // Atomic insert (Postgres unique constraints block duplicates & proxies simultaneously)
    const { data: attendance, error: insertError } = await supabase
      .from('attendance')
      .insert({
        session_uuid: session.id,
        subject_id: session.subject_id,
        student_id: req.user.id,
        teacher_id: session.teacher_id,
        date: new Date().toISOString(),
        status: 'present',
        lat: parseFloat(latitude),
        lng: parseFloat(longitude),
        distance: Math.round(distance),
        device_fingerprint: deviceFingerprint,
        ip_address: req.ip,
        verification_method: 'qr_scan'
      })
      .select()
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        if (insertError.message.includes('unique_session_device')) {
          return res.status(409).json({ error: 'This device has already been used to mark attendance for this session.' });
        }
        return res.status(409).json({ error: 'Attendance already marked for this session.' });
      }
      throw insertError;
    }

    await supabase.rpc('increment_session_attendance', { row_id: session.id });

    res.json({
      success: true,
      message: 'Attendance marked successfully!',
      attendance: {
        subject: session.subjects.name,
        date: attendance.date,
        status: attendance.status,
        distance: Math.round(distance)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/session/:sessionId/students', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { data: session } = await supabase
      .from('qr_sessions')
      .select('id')
      .eq('session_id', req.params.sessionId)
      .eq('teacher_id', req.user.id)
      .single();

    if (!session) return res.status(404).json({ error: 'Session not found.' });

    const { data: records, error } = await supabase
      .from('attendance')
      .select('status, created_at, distance, users!attendance_student_id_fkey(id, name, email, roll_number)')
      .eq('session_uuid', session.id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({
      success: true,
      count: records.length,
      records: records.map(r => ({
        student: {
          _id: r.users.id,
          name: r.users.name,
          email: r.users.email,
          rollNumber: r.users.roll_number
        },
        status: r.status,
        time: r.created_at,
        distance: r.distance
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
