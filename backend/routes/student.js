const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const supabase = require('../config/supabase');

router.get('/dashboard', protect, requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user.id;

    const { data: enrollments } = await supabase
      .from('subject_students')
      .select(`
        subjects (
          id, name, code, color, schedule, total_classes,
          users!subjects_teacher_id_fkey (name, email)
        )
      `)
      .eq('student_id', studentId);

    const subjects = (enrollments || []).map(e => e.subjects).filter(Boolean);

    const subjectStats = await Promise.all(subjects.map(async (subject) => {
      const totalClasses = subject.total_classes || 0;

      const { count: attendedCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subject.id)
        .eq('student_id', studentId)
        .eq('status', 'present');

      const attended = attendedCount || 0;
      const percentage = totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0;

      const { data: recentRecords } = await supabase
        .from('attendance')
        .select('date, status, qr_sessions(class_date)')
        .eq('subject_id', subject.id)
        .eq('student_id', studentId)
        .order('date', { ascending: false })
        .limit(5);

      return {
        subject: {
          _id: subject.id,
          name: subject.name,
          code: subject.code,
          color: subject.color,
          teacher: subject.users,
          schedule: subject.schedule
        },
        totalClasses,
        attended,
        absent: totalClasses - attended,
        percentage,
        isBelowThreshold: percentage < 75,
        classesNeeded: percentage < 75 ? Math.ceil((0.75 * totalClasses - attended) / 0.25) : 0,
        recentRecords: (recentRecords || []).map(r => ({
          date: r.date,
          status: r.status,
          sessionDate: r.qr_sessions?.class_date
        }))
      };
    }));

    const totalClasses = subjectStats.reduce((s, x) => s + x.totalClasses, 0);
    const totalAttended = subjectStats.reduce((s, x) => s + x.attended, 0);
    const overallPercentage = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 100) : 0;

    res.json({
      success: true,
      student: {
        name: req.user.name,
        email: req.user.email,
        rollNumber: req.user.rollNumber,
        department: req.user.department,
        semester: req.user.semester
      },
      summary: {
        totalSubjects: subjects.length,
        totalClasses,
        totalAttended,
        overallPercentage,
        subjectsBelowThreshold: subjectStats.filter(s => s.isBelowThreshold).length
      },
      subjects: subjectStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/attendance/history', protect, requireRole('student'), async (req, res) => {
  try {
    const { subjectId, month, year } = req.query;

    let query = supabase
      .from('attendance')
      .select(`
        id, date, status, distance,
        subjects (id, name, code, color),
        qr_sessions (class_date)
      `)
      .eq('student_id', req.user.id)
      .order('date', { ascending: false });

    if (subjectId) query = query.eq('subject_id', subjectId);

    if (month && year) {
      const start = new Date(year, month - 1, 1).toISOString();
      const end = new Date(year, month, 0, 23, 59, 59).toISOString();
      query = query.gte('date', start).lte('date', end);
    }

    const { data: records, error } = await query;
    if (error) throw error;

    const formatted = records.map(r => ({
      _id: r.id,
      date: r.date,
      status: r.status,
      location: { distance: r.distance },
      subject: r.subjects ? { _id: r.subjects.id, name: r.subjects.name, code: r.subjects.code, color: r.subjects.color } : null,
      session: r.qr_sessions ? { classDate: r.qr_sessions.class_date } : null
    }));

    res.json({ success: true, records: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
