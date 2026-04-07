const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');
const Subject = require('../models/Subject');
const Attendance = require('../models/Attendance');
const QRSession = require('../models/QRSession');
const User = require('../models/User');
const { Parser } = require('json2csv');

// GET /api/teacher/dashboard
router.get('/dashboard', protect, requireRole('teacher'), async (req, res) => {
  try {
    const teacherId = req.user._id;

    const subjects = await Subject.find({ teacher: teacherId })
      .populate('students', 'name email rollNumber')
      .lean();

    const subjectStats = await Promise.all(subjects.map(async (subject) => {
      const totalClasses = subject.totalClasses || 0;
      const totalStudents = subject.students?.length || 0;

      // Overall attendance rate for subject
      const totalAttendanceRecords = await Attendance.countDocuments({
        subject: subject._id,
        status: 'present'
      });

      const maxPossibleAttendances = totalClasses * totalStudents;
      const overallRate = maxPossibleAttendances > 0
        ? Math.round((totalAttendanceRecords / maxPossibleAttendances) * 100)
        : 0;

      // Recent sessions
      const recentSessions = await QRSession.find({ subject: subject._id })
        .sort({ classDate: -1 })
        .limit(3)
        .lean();

      return {
        subject: {
          _id: subject._id,
          name: subject.name,
          code: subject.code,
          color: subject.color,
          schedule: subject.schedule
        },
        totalClasses,
        totalStudents,
        overallRate,
        recentSessions: recentSessions.map(s => ({
          date: s.classDate,
          attendanceCount: s.attendanceCount
        }))
      };
    }));

    res.json({
      success: true,
      teacher: {
        name: req.user.name,
        email: req.user.email,
        department: req.user.department
      },
      summary: {
        totalSubjects: subjects.length,
        totalStudents: [...new Set(subjects.flatMap(s => s.students?.map(st => st._id?.toString()) || []))].length
      },
      subjects: subjectStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/teacher/subject/:subjectId
router.get('/subject/:subjectId', protect, requireRole('teacher'), async (req, res) => {
  try {
    const subject = await Subject.findOne({
      _id: req.params.subjectId,
      teacher: req.user._id
    }).populate('students', 'name email rollNumber semester').lean();

    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const totalClasses = subject.totalClasses || 0;

    // Per student attendance
    const studentStats = await Promise.all((subject.students || []).map(async (student) => {
      const attended = await Attendance.countDocuments({
        subject: subject._id,
        student: student._id,
        status: 'present'
      });

      return {
        student: {
          _id: student._id,
          name: student.name,
          email: student.email,
          rollNumber: student.rollNumber
        },
        attended,
        absent: totalClasses - attended,
        percentage: totalClasses > 0 ? Math.round((attended / totalClasses) * 100) : 0,
        isBelowThreshold: totalClasses > 0 && (attended / totalClasses) < 0.75
      };
    }));

    // Session history
    const sessions = await QRSession.find({ subject: subject._id })
      .sort({ classDate: -1 })
      .lean();

    const sessionDetails = await Promise.all(sessions.map(async (session) => {
      const presentStudents = await Attendance.find({
        session: session._id,
        status: 'present'
      }).populate('student', 'name rollNumber').lean();

      return {
        _id: session._id,
        date: session.classDate,
        attendanceCount: session.attendanceCount,
        presentStudents: presentStudents.map(a => ({
          name: a.student?.name,
          rollNumber: a.student?.rollNumber
        }))
      };
    }));

    // Monthly attendance trend
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const monthlyTrend = await Attendance.aggregate([
      {
        $match: {
          subject: subject._id,
          date: { $gte: sixMonthsAgo },
          status: 'present'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      subject: {
        _id: subject._id,
        name: subject.name,
        code: subject.code,
        color: subject.color,
        totalClasses,
        totalStudents: subject.students?.length || 0,
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

// GET /api/teacher/subject/:subjectId/download-csv
router.get('/subject/:subjectId/download-csv', protect, requireRole('teacher'), async (req, res) => {
  try {
    const subject = await Subject.findOne({
      _id: req.params.subjectId,
      teacher: req.user._id
    }).populate('students', 'name email rollNumber').lean();

    if (!subject) return res.status(404).json({ error: 'Subject not found.' });

    const sessions = await QRSession.find({ subject: subject._id }).sort({ classDate: 1 }).lean();
    const totalClasses = subject.totalClasses || 0;

    const rows = await Promise.all((subject.students || []).map(async (student) => {
      const attended = await Attendance.countDocuments({
        subject: subject._id,
        student: student._id,
        status: 'present'
      });

      const percentage = totalClasses > 0 ? ((attended / totalClasses) * 100).toFixed(1) : '0.0';

      return {
        'Roll Number': student.rollNumber || 'N/A',
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
