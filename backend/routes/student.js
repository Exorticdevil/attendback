const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const Attendance = require('../models/Attendance');
const Subject = require('../models/Subject');
const QRSession = require('../models/QRSession');

// GET /api/student/dashboard
router.get('/dashboard', protect, requireRole('student'), async (req, res) => {
  try {
    const studentId = req.user._id;

    // Get all subjects the student is enrolled in
    const subjects = await Subject.find({ students: studentId })
      .populate('teacher', 'name email')
      .lean();

    const subjectStats = await Promise.all(subjects.map(async (subject) => {
      // Count total sessions for this subject
      const totalSessions = await QRSession.countDocuments({
        subject: subject._id,
        isActive: false,
        classDate: { $lte: new Date() }
      }) + await QRSession.countDocuments({
        subject: subject._id,
        isActive: true
      });

      // Actually use totalClasses from subject
      const totalClasses = subject.totalClasses || 0;

      // Count attended
      const attended = await Attendance.countDocuments({
        subject: subject._id,
        student: studentId,
        status: 'present'
      });

      const percentage = totalClasses > 0
        ? Math.round((attended / totalClasses) * 100)
        : 0;

      // Get recent attendance records
      const recentRecords = await Attendance.find({
        subject: subject._id,
        student: studentId
      })
        .sort({ date: -1 })
        .limit(5)
        .populate('session', 'classDate')
        .lean();

      return {
        subject: {
          _id: subject._id,
          name: subject.name,
          code: subject.code,
          color: subject.color,
          teacher: subject.teacher,
          schedule: subject.schedule
        },
        totalClasses,
        attended,
        absent: totalClasses - attended,
        percentage,
        isBelowThreshold: percentage < 75,
        classesNeeded: percentage < 75
          ? Math.ceil((0.75 * totalClasses - attended) / 0.25)
          : 0,
        recentRecords: recentRecords.map(r => ({
          date: r.date,
          status: r.status,
          sessionDate: r.session?.classDate
        }))
      };
    }));

    // Overall stats
    const totalClasses = subjectStats.reduce((s, x) => s + x.totalClasses, 0);
    const totalAttended = subjectStats.reduce((s, x) => s + x.attended, 0);
    const overallPercentage = totalClasses > 0
      ? Math.round((totalAttended / totalClasses) * 100)
      : 0;

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

// GET /api/student/attendance/history
router.get('/attendance/history', protect, requireRole('student'), async (req, res) => {
  try {
    const { subjectId, month, year } = req.query;

    const filter = { student: req.user._id };
    if (subjectId) filter.subject = subjectId;

    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end = new Date(year, month, 0);
      filter.date = { $gte: start, $lte: end };
    }

    const records = await Attendance.find(filter)
      .populate('subject', 'name code color')
      .populate('session', 'classDate')
      .sort({ date: -1 })
      .lean();

    res.json({ success: true, records });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
