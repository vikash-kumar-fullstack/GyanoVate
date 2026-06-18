const express = require('express');
const { requireRole } = require('../middleware/auth');
const School = require('../models/School');
const User = require('../models/User');
const Lecture = require('../models/Lecture');
const { SUBJECTS } = require('../models/Subject');
const router = express.Router();

const multer = require('multer');
const cloudinary = require('../config/cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: { folder: 'teachers', format: 'jpg' }
});
const upload = multer({ storage, limits: { fileSize: 5*1024*1024 } });
router.use(requireRole('ministry'));

// Dashboard
// ==== Replace the old /dashboard route with this ====
router.get('/dashboard', async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const selectedSchoolId = req.query.schoolId || null;
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay   = new Date(dateStr + 'T23:59:59.999Z');

    // All active schools (for dropdown + calculations)
    const allSchools = await School.find({ isActive: true }).lean();
    const schoolData = [];

    for (const school of allSchools) {
      const teachers = await User.find({
        role: 'teacher',
        schoolId: school._id,
        isActive: true
      }).lean();
      const teacherIds = teachers.map(t => t._id.toString());

      // ----- Teacher attendance -----
      let presentCount = 0;
      teachers.forEach(t => {
        if (t.attendance && t.attendance.some(a => {
          const aDate = typeof a.date === 'string' ? a.date.slice(0,10) : a.date.toISOString().slice(0,10);
          return aDate === dateStr;
        })) presentCount++;
      });
      const attendancePercent = teacherIds.length > 0
        ? ((presentCount / teacherIds.length) * 100).toFixed(1)
        : '0';

      // ----- Student count per class -----
      let totalStudent = 0, classesWithData = 0;
      teachers.forEach(t => {
        if (t.classTeacherOf && t.studentAttendance) {
          const record = t.studentAttendance.find(sa => {
            const saDate = typeof sa.date === 'string' ? sa.date.slice(0,10) : sa.date.toISOString().slice(0,10);
            return saDate === dateStr;
          });
          if (record && typeof record.studentCount === 'number') {
            totalStudent += record.studentCount;
            classesWithData++;
          }
        }
      });
      const avgStudentCount = classesWithData > 0
        ? (totalStudent / classesWithData).toFixed(1)
        : '0';

      // ----- Lectures (all, no status filter) -----
      const lectures = await Lecture.find({
        schoolId: school._id,
        date: { $gte: startOfDay, $lte: endOfDay },
        teacherId: { $in: teacherIds }
      }).select('teacherId analysis.transcriptMatchPercentage analysis.humanVoiceProbability').lean();

      let matchSum = 0, matchCount = 0, voiceSum = 0, voiceCount = 0;
      lectures.forEach(lec => {
        if (lec.analysis?.transcriptMatchPercentage != null) {
          matchSum += lec.analysis.transcriptMatchPercentage;
          matchCount++;
        }
        if (lec.analysis?.humanVoiceProbability != null) {
          voiceSum += lec.analysis.humanVoiceProbability;
          voiceCount++;
        }
      });

      const avgContentMatch = matchCount > 0 ? (matchSum / matchCount).toFixed(1) : '0';
      const avgVoiceProb = voiceCount > 0 ? (voiceSum / voiceCount).toFixed(1) : '0';

      // Threshold percentages (for reference)
      let contentAbove75 = 0, voiceAbove90 = 0;
      // per teacher
      const teacherSums = {};
      lectures.forEach(lec => {
        const tid = lec.teacherId.toString();
        if (!teacherSums[tid]) teacherSums[tid] = { mS:0, mC:0, vS:0, vC:0 };
        if (lec.analysis?.transcriptMatchPercentage != null) {
          teacherSums[tid].mS += lec.analysis.transcriptMatchPercentage;
          teacherSums[tid].mC++;
        }
        if (lec.analysis?.humanVoiceProbability != null) {
          teacherSums[tid].vS += lec.analysis.humanVoiceProbability;
          teacherSums[tid].vC++;
        }
      });
      teacherIds.forEach(tid => {
        const d = teacherSums[tid];
        const avgM = d && d.mC>0 ? d.mS/d.mC : 0;
        const avgV = d && d.vC>0 ? d.vS/d.vC : 0;
        if (avgM > 75) contentAbove75++;
        if (avgV > 0) voiceAbove90++;
      });

      schoolData.push({
        schoolId: school._id.toString(),
        name: school.name,
        code: school.code,
        teacherCount: teacherIds.length,
        attendancePercent: parseFloat(attendancePercent),
        avgStudentCount: parseFloat(avgStudentCount),
        avgContentMatch: parseFloat(avgContentMatch),
        avgVoiceProb: parseFloat(avgVoiceProb),
        contentAbove75Percent: teacherIds.length>0 ? ((contentAbove75/teacherIds.length)*100).toFixed(1) : 0,
        voiceAbove90Percent: teacherIds.length>0 ? ((voiceAbove90/teacherIds.length)*100).toFixed(1) : 0
      });
    }

    // Overall averages (for the comparison charts)
    const overallAttendance = schoolData.length>0
      ? (schoolData.reduce((s,x) => s+x.attendancePercent,0) / schoolData.length).toFixed(1) : '0';
    const overallStudents = schoolData.length>0
      ? (schoolData.reduce((s,x) => s+x.avgStudentCount,0) / schoolData.length).toFixed(1) : '0';
    const overallMatch = schoolData.length>0
      ? (schoolData.reduce((s,x) => s+x.avgContentMatch,0) / schoolData.length).toFixed(1) : '0';
    const overallVoice = schoolData.length>0
      ? (schoolData.reduce((s,x) => s+x.avgVoiceProb,0) / schoolData.length).toFixed(1) : '0';

    // Rankings for each metric
    const rankAttendance = [...schoolData].sort((a,b) => b.attendancePercent - a.attendancePercent);
    const rankStudents   = [...schoolData].sort((a,b) => b.avgStudentCount - a.avgStudentCount);
    const rankContent    = [...schoolData].sort((a,b) => b.avgContentMatch - a.avgContentMatch);
    const rankVoice      = [...schoolData].sort((a,b) => b.avgVoiceProb - a.avgVoiceProb);

    // Selected school details
    let selectedSchool = null;
    if (selectedSchoolId) {
      selectedSchool = schoolData.find(s => s.schoolId === selectedSchoolId) || null;
    }

    res.render('ministry/dashboard', {
      title: 'Ministry Dashboard',
      date: dateStr,
      schools: allSchools,                // for dropdown
      selectedSchoolId,
      selectedSchool,                     // computed data for the chosen school
      schoolData,                         // all schools' metrics
      overall: {
        attendance: overallAttendance,
        students: overallStudents,
        match: overallMatch,
        voice: overallVoice
      },
      rankings: {
        attendance: rankAttendance,
        students: rankStudents,
        content: rankContent,
        voice: rankVoice
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).render('error', { error: 'Failed to load dashboard' });
  }
});

// School management
router.get('/schools/create', (req, res) => {
    res.render('ministry/create-school', { title: 'Create School' });
});
router.post('/schools/create', async (req, res) => {
    try {
        const { name, code, address, district, state, latitude, longitude, principalEmail } = req.body;
        const school = new School({ name, code, address, district, state, latitude: parseFloat(latitude), longitude: parseFloat(longitude), isActive: true });
        await school.save();
        let plainPassword = null;
        if (principalEmail) {
            plainPassword = Math.random().toString(36).slice(-8);
            const principal = new User({
                name: `Principal of ${name}`, email: principalEmail, password: plainPassword, plainPassword,
                role: 'principal', schoolId: school._id, isActive: true
            });
            await principal.save();
            school.principalId = principal._id;
            school.principalPlainPassword = plainPassword;
            await school.save();
        }
        res.redirect(`/ministry/schools?message=School created. ${principalEmail ? `Principal password: ${plainPassword}` : ''}`);
    } catch (err) {
        res.redirect(`/ministry/schools/create?error=${err.message}`);
    }
});
router.get('/schools', async (req, res) => {
    const schools = await School.find().populate('principalId');
    res.render('ministry/schools', { schools, title: 'Schools' });
});
router.get('/schools/:id/report', async (req, res) => {
    const school = await School.findById(req.params.id).populate('principalId');
    const teachers = await User.find({ role: 'teacher', schoolId: school._id });
    const lectures = await Lecture.find({ schoolId: school._id }).populate('teacherId');
    res.render('ministry/school-report', { school, teachers, lectures, title: `Report: ${school.name}` });
});

// Teacher creation
router.get('/schools/:schoolId/teachers/create', async (req, res) => {
    const school = await School.findById(req.params.schoolId);
    if (!school) return res.status(404).render('error', { error: 'School not found' });
    res.render('ministry/create-teacher', { school, title: `Create Teacher - ${school.name}` });
});
router.post('/schools/:schoolId/teachers/create', upload.single('profileImage'), async (req, res) => {
    try {
        const { name, email, subjects, classes, classTeacherOf } = req.body;
        const school = await School.findById(req.params.schoolId);
        if (!school) throw new Error('School not found');
        const existing = await User.findOne({ email });
        if (existing) throw new Error('Email already exists');
        const plainPassword = Math.random().toString(36).slice(-8);
        const teacher = new User({
            name, email, password: plainPassword, plainPassword,
            role: 'teacher', schoolId: school._id,
            subjects: subjects ? subjects.split(',').map(s => s.trim()) : [],
            classes: classes ? classes.split(',').map(c => parseInt(c.trim())) : [],
            classTeacherOf: classTeacherOf ? parseInt(classTeacherOf) : null,
            imageUrl: req.file ? req.file.path : null,
            cloudinaryId: req.file ? req.file.filename : null,
            isActive: true
        });
        await teacher.save();
        res.redirect(`/ministry/schools/${school._id}/report?message=Teacher created. Email: ${email}, Password: ${plainPassword}`);
    } catch (err) {
        const school = await School.findById(req.params.schoolId);
        res.render('ministry/create-teacher', { school, error: err.message, title: 'Create Teacher' });
    }
});
// ========== REPORTS ==========
router.get('/reports/attendance', async (req, res) => {
    const { schoolId, teacherId, startDate, endDate } = req.query;
    let teacherFilter = { role: 'teacher' };
    if (schoolId) teacherFilter.schoolId = schoolId;
    if (teacherId) teacherFilter._id = teacherId;
    const teachers = await User.find(teacherFilter).populate('schoolId');
    const schools = await School.find({ isActive: true });
    let attendanceData = [];
    for (const teacher of teachers) {
        let attendance = teacher.attendance || [];
        if (startDate) attendance = attendance.filter(a => a.date >= startDate);
        if (endDate) attendance = attendance.filter(a => a.date <= endDate);
        attendanceData.push({
            teacher: teacher.name,
            school: teacher.schoolId?.name || 'N/A',
            email: teacher.email,
            attendance
        });
    }
    res.render('ministry/attendance-report', { attendanceData, schools, teachers, selectedSchool: schoolId, selectedTeacher: teacherId, startDate, endDate, title: 'Attendance Reports' });
});

router.get('/reports/lectures', async (req, res) => {
    const { schoolId, teacherId, startDate, endDate } = req.query;
    let lectureFilter = {};
    if (schoolId) lectureFilter.schoolId = schoolId;
    if (teacherId) lectureFilter.teacherId = teacherId;
    if (startDate) lectureFilter.date = { $gte: new Date(startDate) };
    if (endDate) lectureFilter.date = { ...lectureFilter.date, $lte: new Date(endDate) };
    const lectures = await Lecture.find(lectureFilter).populate('teacherId').populate('schoolId').sort({ date: -1 });
    const schools = await School.find({ isActive: true });
    const teachers = await User.find({ role: 'teacher' });
    res.render('ministry/lecture-report', { lectures, schools, teachers, selectedSchool: schoolId, selectedTeacher: teacherId, startDate, endDate, title: 'Lecture Analysis Reports' });
});

router.get('/reports/student-count', async (req, res) => {
    const { schoolId, startDate, endDate } = req.query;
    let teacherFilter = { role: 'teacher' };
    if (schoolId) teacherFilter.schoolId = schoolId;
    const teachers = await User.find(teacherFilter).populate('schoolId');
    const schools = await School.find({ isActive: true });
    let studentData = [];
    for (const teacher of teachers) {
        let studentAttendance = teacher.studentAttendance || [];
        if (startDate) studentAttendance = studentAttendance.filter(sa => sa.date >= startDate);
        if (endDate) studentAttendance = studentAttendance.filter(sa => sa.date <= endDate);
        studentData.push({
            teacher: teacher.name,
            school: teacher.schoolId?.name || 'N/A',
            records: studentAttendance
        });
    }
    res.render('ministry/student-count-report', { studentData, schools, selectedSchool: schoolId, startDate, endDate, title: 'Student Count Reports' });
});

module.exports = router;