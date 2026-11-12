const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const supabase = require('../config/supabase');
const { Parser } = require('json2csv');

router.get('/dashboard', protect, requireRole('teacher'), async (req, res) => {
  try {
    const teacherId = req.user.id;

    const { data: subjects } = await supabase
      .from('subjects')
      .select('*, subject_students(student_id)')
      .eq('teacher_id', teacherId);

    const subjectStats = await Promise.all((subjects || []).map(async (subject) => {
      const totalClasses = subject.total_classes || 0;
      const totalStudents = subject.subject_students?.length || 0;

      const { count: presentCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subject.id)
        .eq('status', 'present');

      const maxPossible = totalClasses * totalStudents;
      const overallRate = maxPossible > 0 ? Math.round(((presentCount || 0) / maxPossible) * 100) : 0;

      const { data: recentSessions } = await supabase
        .from('qr_sessions')
        .select('class_date, attendance_count')
        .eq('subject_id', subject.id)
        .order('class_date', { ascending: false })
        .limit(3);

      return {
        subject: {
          _id: subject.id,
          name: subject.name,
          code: subject.code,
          color: subject.color,
          schedule: subject.schedule
        },
        totalClasses,
        totalStudents,
        overallRate,
        recentSessions: (recentSessions || []).map(s => ({
          date: s.class_date,
          attendanceCount: s.attendance_count
        }))
      };
    }));

    const uniqueStudentIds = new Set(
      (subjects || []).flatMap(s => (s.subject_students || []).map(ss => ss.student_id))
    );

    res.json({
      success: true,
      teacher: {
        name: req.user.name,
        email: req.user.email,
        department: req.user.department
      },
      summary: {
        totalSubjects: (subjects || []).length,
        totalStudents: uniqueStudentIds.size
      },
      subjects: subjectStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subject/:subjectId', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { data: subject } = await supabase
      .from('subjects')
      .select(`
        *,
        subject_students (
          users (id, name, email, roll_number, semester)
        )
      `)
      .eq('id', req.params.subjectId)
      .eq('teacher_id', req.user.id)
      .single();

    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const students = (subject.subject_students || []).map(ss => ss.users).filter(Boolean);
    const totalClasses = subject.total_classes || 0;

    const studentStats = await Promise.all(students.map(async (student) => {
      const { count: attendedCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subject.id)
        .eq('student_id', student.id)
        .eq('status', 'present');

      const attended = attendedCount || 0;
      return {
        student: {
          _id: student.id,
          name: student.name,
          email: student.email,
          rollNumber: student.roll_number
        },
        attended,
        absent: totalClasses - attended,
        percentage: totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0,
        isBelowThreshold: totalClasses > 0 && (attended / totalClasses) < 0.75
      };
    }));

    const { data: sessions } = await supabase
      .from('qr_sessions')
      .select('*')
      .eq('subject_id', subject.id)
      .order('class_date', { ascending: false });

    const sessionDetails = await Promise.all((sessions || []).map(async (session) => {
      const { data: present } = await supabase
        .from('attendance')
        .select('users!attendance_student_id_fkey(name, roll_number)')
        .eq('session_uuid', session.id)
        .eq('status', 'present');

      return {
        _id: session.id,
        date: session.class_date,
        attendanceCount: session.attendance_count,
        presentStudents: (present || []).map(a => ({
          name: a.users?.name,
          rollNumber: a.users?.roll_number
        }))
      };
    }));

    // Monthly trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const { data: trendRecords } = await supabase
      .from('attendance')
      .select('date')
      .eq('subject_id', subject.id)
      .eq('status', 'present')
      .gte('date', sixMonthsAgo.toISOString());

    const trendMap = {};
    (trendRecords || []).forEach(r => {
      const d = new Date(r.date);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      if (!trendMap[key]) {
        trendMap[key] = { _id: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }, count: 0 };
      }
      trendMap[key].count++;
    });

    const monthlyTrend = Object.values(trendMap).sort(
      (a, b) => a._id.year - b._id.year || a._id.month - b._id.month
    );

    res.json({
      success: true,
      subject: {
        _id: subject.id,
        name: subject.name,
        code: subject.code,
        color: subject.color,
        totalClasses,
        totalStudents: students.length,
        schedule: subject.schedule
      },
      studentStats: studentStats.sort((a, b) => a.student.name?.localeCompare(b.student.name)),
      sessions: sessionDetails,
      monthlyTrend
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/subject/:subjectId/download-csv', protect, requireRole('teacher'), async (req, res) => {
  try {
    const { data: subject } = await supabase
      .from('subjects')
      .select(`
        *,
        subject_students (
          users (id, name, email, roll_number)
        )
      `)
      .eq('id', req.params.subjectId)
      .eq('teacher_id', req.user.id)
      .single();

    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const students = (subject.subject_students || []).map(ss => ss.users).filter(Boolean);
    const totalClasses = subject.total_classes || 0;

    const rows = await Promise.all(students.map(async (student) => {
      const { count: attendedCount } = await supabase
        .from('attendance')
        .select('*', { count: 'exact', head: true })
        .eq('subject_id', subject.id)
        .eq('student_id', student.id)
        .eq('status', 'present');

      const attended = attendedCount || 0;
      const percentage = totalClasses > 0 ? ((attended / totalClasses) * 100).toFixed(1) : '0.0';

      return {
        'Roll Number': student.roll_number || 'N/A',
        'Student Name': student.name,
        'Email': student.email,
        'Total Classes': totalClasses,
        'Classes Attended': attended,
        'Classes Absent': totalClasses - attended,
        'Attendance %': `${percentage}%`,
        'Status': parseFloat(percentage) >= 75 ? 'ELIGIBLE' : 'SHORT'
      };
    }));

    const fields = ['Roll Number', 'Student Name', 'Email', 'Total Classes', 'Classes Attended', 'Classes Absent', 'Attendance %', 'Status'];
    const parser = new Parser({ fields });
    const csv = parser.parse(rows);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${subject.code}_attendance_${new Date().toISOString().split('T')[0]}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
