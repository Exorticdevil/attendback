require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

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
  { name: 'Arjun Mehta', email: 'arjun.mehta@student.edu', roll_number: 'CS21001', semester: 3 },
  { name: 'Priya Patel', email: 'priya.patel@student.edu', roll_number: 'CS21002', semester: 3 },
  { name: 'Rohan Das', email: 'rohan.das@student.edu', roll_number: 'CS21003', semester: 3 },
  { name: 'Sneha Roy', email: 'sneha.roy@student.edu', roll_number: 'CS21004', semester: 3 },
  { name: 'Aditya Singh', email: 'aditya.singh@student.edu', roll_number: 'CS21005', semester: 3 },
  { name: 'Kavya Nair', email: 'kavya.nair@student.edu', roll_number: 'CS21006', semester: 3 },
  { name: 'Vikram Joshi', email: 'vikram.joshi@student.edu', roll_number: 'CS21007', semester: 3 },
  { name: 'Divya Reddy', email: 'divya.reddy@student.edu', roll_number: 'CS21008', semester: 3 },
  { name: 'Suresh Iyer', email: 'suresh.iyer@student.edu', roll_number: 'CS21009', semester: 3 },
  { name: 'Pooja Gupta', email: 'pooja.gupta@student.edu', roll_number: 'CS21010', semester: 3 },
  { name: 'Amit Sharma', email: 'amit.sharma@student.edu', roll_number: 'CS21011', semester: 3 },
  { name: 'Neha Verma', email: 'neha.verma@student.edu', roll_number: 'CS21012', semester: 3 },
  { name: 'Rahul Chandra', email: 'rahul.chandra@student.edu', roll_number: 'CS21013', semester: 3 },
  { name: 'Ananya Pillai', email: 'ananya.pillai@student.edu', roll_number: 'CS21014', semester: 3 },
  { name: 'Karthik Menon', email: 'karthik.menon@student.edu', roll_number: 'CS21015', semester: 3 },
  { name: 'Shreya Banerjee', email: 'shreya.banerjee@student.edu', roll_number: 'CS21016', semester: 3 },
  { name: 'Dev Malhotra', email: 'dev.malhotra@student.edu', roll_number: 'CS21017', semester: 3 },
  { name: 'Ishita Kapoor', email: 'ishita.kapoor@student.edu', roll_number: 'CS21018', semester: 3 },
  { name: 'Varun Tiwari', email: 'varun.tiwari@student.edu', roll_number: 'CS21019', semester: 3 },
  { name: 'Riya Desai', email: 'riya.desai@student.edu', roll_number: 'CS21020', semester: 3 },
];

async function seed() {
  // Clear existing records
  await supabase.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('qr_sessions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('subject_students').delete().neq('subject_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('subjects').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('users').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  console.log('🗑️ Cleared existing Supabase data');

  const hashedTeacherPwd = await bcrypt.hash('teacher123', 12);
  const { data: teacherDocs, error: tErr } = await supabase
    .from('users')
    .insert(TEACHERS.map(t => ({ ...t, password: hashedTeacherPwd })))
    .select();
  if (tErr) throw tErr;
  console.log(`✅ Created ${teacherDocs.length} teachers`);

  const hashedStudentPwd = await bcrypt.hash('student123', 12);
  const { data: studentDocs, error: sErr } = await supabase
    .from('users')
    .insert(STUDENTS.map(s => ({ ...s, role: 'student', department: 'Computer Science', password: hashedStudentPwd })))
    .select();
  if (sErr) throw sErr;
  console.log(`✅ Created ${studentDocs.length} students`);

  const subjectAssignments = [
    { subjectIdx: 0, teacherIdx: 0 },
    { subjectIdx: 1, teacherIdx: 0 },
    { subjectIdx: 2, teacherIdx: 1 },
    { subjectIdx: 3, teacherIdx: 1 },
    { subjectIdx: 4, teacherIdx: 2 },
    { subjectIdx: 5, teacherIdx: 2 },
  ];

  for (const { subjectIdx, teacherIdx } of subjectAssignments) {
    const sub = SUBJECTS[subjectIdx];
    const { data: createdSub, error: subErr } = await supabase
      .from('subjects')
      .insert({
        name: sub.name,
        code: sub.code,
        color: sub.color,
        semester: sub.semester,
        teacher_id: teacherDocs[teacherIdx].id,
        department: 'Computer Science',
        total_classes: 0,
        classroom_lat: 22.5726 + (Math.random() - 0.5) * 0.01,
        classroom_lng: 88.3639 + (Math.random() - 0.5) * 0.01,
        classroom_radius: 100,
        schedule: [
          { day: 'Monday', startTime: '09:00', endTime: '10:00' },
          { day: 'Wednesday', startTime: '11:00', endTime: '12:00' }
        ]
      })
      .select()
      .single();
    if (subErr) throw subErr;

    const enrollments = studentDocs.map(st => ({
      subject_id: createdSub.id,
      student_id: st.id
    }));
    const { error: enrErr } = await supabase.from('subject_students').insert(enrollments);
    if (enrErr) throw enrErr;
  }

  console.log(`✅ Created ${SUBJECTS.length} subjects & enrolled all 20 students`);
  console.log('🎉 Seed complete!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
