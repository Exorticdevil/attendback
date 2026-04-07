require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');
const Subject = require('../models/Subject');

const SUBJECTS = [
  { name: 'Data Structures & Algorithms', code: 'CS301', color: '#6366f1', semester: 3 },
  { name: 'Database Management Systems', code: 'CS302', color: '#ec4899', semester: 3 },
  { name: 'Operating Systems', code: 'CS303', color: '#f59e0b', semester: 3 },
  { name: 'Computer Networks', code: 'CS304', color: '#10b981', semester: 3 },
  { name: 'Software Engineering', code: 'CS305', color: '#3b82f6', semester: 3 },
  { name: 'Machine Learning', code: 'CS401', color: '#8b5cf6', semester: 4 },
];

const TEACHERS = [
  { name: 'Dr. Priya Sharma', email: 'priya.sharma@college.edu', role: 'teacher', department: 'Computer Science', password: 'teacher123' },
  { name: 'Prof. Rajesh Kumar', email: 'rajesh.kumar@college.edu', role: 'teacher', department: 'Computer Science', password: 'teacher123' },
  { name: 'Dr. Anita Bose', email: 'anita.bose@college.edu', role: 'teacher', department: 'Computer Science', password: 'teacher123' },
];

const STUDENTS = [
  { name: 'Arjun Mehta', email: 'arjun.mehta@student.edu', rollNumber: 'CS21001', semester: 3 },
  { name: 'Priya Patel', email: 'priya.patel@student.edu', rollNumber: 'CS21002', semester: 3 },
  { name: 'Rohan Das', email: 'rohan.das@student.edu', rollNumber: 'CS21003', semester: 3 },
  { name: 'Sneha Roy', email: 'sneha.roy@student.edu', rollNumber: 'CS21004', semester: 3 },
  { name: 'Aditya Singh', email: 'aditya.singh@student.edu', rollNumber: 'CS21005', semester: 3 },
  { name: 'Kavya Nair', email: 'kavya.nair@student.edu', rollNumber: 'CS21006', semester: 3 },
  { name: 'Vikram Joshi', email: 'vikram.joshi@student.edu', rollNumber: 'CS21007', semester: 3 },
  { name: 'Divya Reddy', email: 'divya.reddy@student.edu', rollNumber: 'CS21008', semester: 3 },
  { name: 'Suresh Iyer', email: 'suresh.iyer@student.edu', rollNumber: 'CS21009', semester: 3 },
  { name: 'Pooja Gupta', email: 'pooja.gupta@student.edu', rollNumber: 'CS21010', semester: 3 },
  { name: 'Amit Sharma', email: 'amit.sharma@student.edu', rollNumber: 'CS21011', semester: 3 },
  { name: 'Neha Verma', email: 'neha.verma@student.edu', rollNumber: 'CS21012', semester: 3 },
  { name: 'Rahul Chandra', email: 'rahul.chandra@student.edu', rollNumber: 'CS21013', semester: 3 },
  { name: 'Ananya Pillai', email: 'ananya.pillai@student.edu', rollNumber: 'CS21014', semester: 3 },
  { name: 'Karthik Menon', email: 'karthik.menon@student.edu', rollNumber: 'CS21015', semester: 3 },
  { name: 'Shreya Banerjee', email: 'shreya.banerjee@student.edu', rollNumber: 'CS21016', semester: 3 },
  { name: 'Dev Malhotra', email: 'dev.malhotra@student.edu', rollNumber: 'CS21017', semester: 3 },
  { name: 'Ishita Kapoor', email: 'ishita.kapoor@student.edu', rollNumber: 'CS21018', semester: 3 },
  { name: 'Varun Tiwari', email: 'varun.tiwari@student.edu', rollNumber: 'CS21019', semester: 3 },
  { name: 'Riya Desai', email: 'riya.desai@student.edu', rollNumber: 'CS21020', semester: 3 },
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB');

  // Clear existing data
  await User.deleteMany({});
  await Subject.deleteMany({});
  console.log('🗑️  Cleared existing data');

  // Create teachers
  const teacherDocs = await User.create(TEACHERS);
  console.log(`✅ Created ${teacherDocs.length} teachers`);

  // Create students
  const studentData = STUDENTS.map(s => ({
    ...s,
    role: 'student',
    department: 'Computer Science',
    password: 'student123'
  }));
  const studentDocs = await User.create(studentData);
  console.log(`✅ Created ${studentDocs.length} students`);

  // Create subjects and assign teachers
  const subjectAssignments = [
    { subjectIdx: 0, teacherIdx: 0 },
    { subjectIdx: 1, teacherIdx: 0 },
    { subjectIdx: 2, teacherIdx: 1 },
    { subjectIdx: 3, teacherIdx: 1 },
    { subjectIdx: 4, teacherIdx: 2 },
    { subjectIdx: 5, teacherIdx: 2 },
  ];

  const allStudentIds = studentDocs.map(s => s._id);

  for (const { subjectIdx, teacherIdx } of subjectAssignments) {
    const sub = SUBJECTS[subjectIdx];
    await Subject.create({
      ...sub,
      teacher: teacherDocs[teacherIdx]._id,
      students: allStudentIds,
      department: 'Computer Science',
      totalClasses: 0,
      classroom: {
        latitude: 22.5726 + (Math.random() - 0.5) * 0.01,
        longitude: 88.3639 + (Math.random() - 0.5) * 0.01,
        radius: 100
      },
      schedule: [
        { day: 'Monday', startTime: '09:00', endTime: '10:00' },
        { day: 'Wednesday', startTime: '11:00', endTime: '12:00' }
      ]
    });
  }
  console.log(`✅ Created ${SUBJECTS.length} subjects`);

  console.log('\n🎉 Seed complete!\n');
  console.log('📧 Teacher logins:');
  TEACHERS.forEach(t => console.log(`   ${t.email} / ${t.password}`));
  console.log('\n📧 Student login (all same password):');
  console.log(`   ${STUDENTS[0].email} / student123`);
  console.log('   (all 20 students use password: student123)');

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
