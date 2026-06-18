const express = require('express');
const { requireRole } = require('../middleware/auth');
const School = require('../models/School');
const User = require('../models/User');
const Lecture = require('../models/Lecture');
const { SUBJECTS, TOPICS_BY_SUBJECT } = require('../models/Subject');
const router = express.Router();

router.use(requireRole('principal'));
router.use(async (req, res, next) => {
    req.school = await School.findById(req.user.schoolId);
    res.locals.school = req.school;
    next();
});

router.get('/dashboard', async (req, res) => {
  try {
    const dateStr = req.query.date || new Date().toISOString().slice(0, 10);
    const selectedTeacherId = req.query.teacherId || null;
    const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
    const endOfDay   = new Date(dateStr + 'T23:59:59.999Z');

    const schoolId = req.school._id;

    // All teachers of this school
    const teachers = await User.find({
      role: 'teacher',
      schoolId: schoolId,
      isActive: true
    }).lean();
    const teacherIds = teachers.map(t => t._id.toString());

    // -----------------------------
    // Compute metrics per teacher
    // -----------------------------
    const teacherData = [];

    for (const teacher of teachers) {
      // Attendance
      let present = false;
      if (teacher.attendance && teacher.attendance.some(a => {
        const aDate = typeof a.date === 'string' ? a.date.slice(0, 10) : a.date.toISOString().slice(0, 10);
        return aDate === dateStr;
      })) {
        present = true;
      }
      const attendancePercent = present ? 100 : 0;   // single teacher: present or not

      // Student count (only if class teacher)
      let studentCount = 0;
      if (teacher.classTeacherOf && teacher.studentAttendance) {
        const record = teacher.studentAttendance.find(sa => {
          const saDate = typeof sa.date === 'string' ? sa.date.slice(0, 10) : sa.date.toISOString().slice(0, 10);
          return saDate === dateStr;
        });
        if (record && typeof record.studentCount === 'number') {
          studentCount = record.studentCount;
        }
      }

      // Lectures by this teacher on this date
      const lectures = await Lecture.find({
        teacherId: teacher._id,
        schoolId: schoolId,
        date: { $gte: startOfDay, $lte: endOfDay }
      }).select('analysis.transcriptMatchPercentage analysis.humanVoiceProbability').lean();

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

      const avgContentMatch = matchCount > 0 ? (matchSum / matchCount) : 0;
      const avgVoiceProb = voiceCount > 0 ? (voiceSum / voiceCount) : 0;

      teacherData.push({
        teacherId: teacher._id.toString(),
        name: teacher.name,
        email: teacher.email,
        subjects: teacher.subjects || [],
        classTeacherOf: teacher.classTeacherOf || null,
        attendancePercent,
        studentCount,
        avgContentMatch: parseFloat(avgContentMatch.toFixed(1)),
        avgVoiceProb: parseFloat(avgVoiceProb.toFixed(1)),
        lectureCount: lectures.length
      });
    }

    // -----------------------------
    // Overall school averages
    // -----------------------------
    const totalTeachers = teacherData.length;
    const overallAttendance = totalTeachers > 0
      ? (teacherData.reduce((s, t) => s + t.attendancePercent, 0) / totalTeachers).toFixed(1)
      : '0';
    const overallStudents = totalTeachers > 0
      ? (teacherData.filter(t => t.studentCount > 0).reduce((s, t) => s + t.studentCount, 0) /
         (teacherData.filter(t => t.studentCount > 0).length || 1)).toFixed(1)
      : '0';
    const overallMatch = totalTeachers > 0
      ? (teacherData.reduce((s, t) => s + t.avgContentMatch, 0) / totalTeachers).toFixed(1)
      : '0';
    const overallVoice = totalTeachers > 0
      ? (teacherData.reduce((s, t) => s + t.avgVoiceProb, 0) / totalTeachers).toFixed(1)
      : '0';

    // Rankings for each metric
    const rankAttendance = [...teacherData].sort((a, b) => b.attendancePercent - a.attendancePercent);
    const rankStudents   = [...teacherData].sort((a, b) => b.studentCount - a.studentCount);
    const rankContent    = [...teacherData].sort((a, b) => b.avgContentMatch - a.avgContentMatch);
    const rankVoice      = [...teacherData].sort((a, b) => b.avgVoiceProb - a.avgVoiceProb);

    // Selected teacher details
    let selectedTeacher = null;
    if (selectedTeacherId) {
      selectedTeacher = teacherData.find(t => t.teacherId === selectedTeacherId) || null;
    }
const lectures = await Lecture.find({ schoolId: req.school._id, date: { $gte: new Date().setHours(0,0,0,0) } }).populate('teacherId');
    res.render('principal/dashboard', {
      title: `Dashboard - ${req.school.name}`,
      school: req.school,
      date: dateStr,
      teachers: teachers,                     // for dropdown
      selectedTeacherId,
      selectedTeacher,
      teacherData,    
      lectures,                        // all metrics
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
    res.status(500).render('error', { error: 'Failed to load principal dashboard' });
  }
});

router.get('/lectures/create', async (req, res) => {
    const teachers = await User.find({ role: 'teacher', schoolId: req.school._id });
    res.render('principal/create-lecture', { teachers, subjects: SUBJECTS, topics: TOPICS_BY_SUBJECT, title: 'Create Lecture' });
});
const mongoose = require('mongoose');

router.post('/lectures/create', async (req, res) => {
    try {
        const {
            title,
            teacherId,
            subject,
            topic,
            classNum,
            date,
            startTime,
            endTime,
            youtubeUrl,
            referenceTranscript
        } = req.body;

        // ✅ Validate topic safely
        const validTopics = TOPICS_BY_SUBJECT[subject] || [];
        if (!validTopics.map(t => t.trim()).includes(topic.trim())) {
            throw new Error(`Invalid topic for ${subject}`);
        }

        const lecture = new Lecture({
            title,
            teacherId: new mongoose.Types.ObjectId(teacherId), // ✅ FIX
            schoolId: req.school._id,
            classNum: Number(classNum), // ✅ FIX
            subject,
            topic,
            date: new Date(date),
            startTime,
            endTime,
            youtubeVideo: {
                url: youtubeUrl || null,
                transcript: referenceTranscript || null,
                transcriptGenerated: !!referenceTranscript,
                transcriptSource: referenceTranscript
                    ? 'manual'
                    : (youtubeUrl ? 'youtube' : 'none') // ✅ FIXED (NO 'pending')
            },
            status: 'scheduled'
        });

        await lecture.save();

        res.redirect('/principal/dashboard?message=Lecture created');

    } catch (err) {
        console.log("ERROR:", err.message); // 🔥 Debug log

        const teachers = await User.find({
            role: 'teacher',
            schoolId: req.school._id
        });

        res.render('principal/create-lecture', {
            teachers,
            subjects: SUBJECTS,
            topics: TOPICS_BY_SUBJECT,
            error: err.message,
            title: 'Create Lecture'
        });
    }
});

// Reports for principal (own school)
router.get('/reports/attendance', async (req, res) => {
    const { teacherId, startDate, endDate } = req.query;
    let teacherFilter = { role: 'teacher', schoolId: req.school._id };
    if (teacherId) teacherFilter._id = teacherId;
    const teachers = await User.find(teacherFilter);
    let attendanceData = [];
    for (const teacher of teachers) {
        let attendance = teacher.attendance || [];
        if (startDate) attendance = attendance.filter(a => a.date >= startDate);
        if (endDate) attendance = attendance.filter(a => a.date <= endDate);
        attendanceData.push({ teacher: teacher.name, email: teacher.email, attendance });
    }
    res.render('principal/attendance-report', { attendanceData, teachers: await User.find({ role: 'teacher', schoolId: req.school._id }), selectedTeacher: teacherId, startDate, endDate, title: 'Attendance Reports' });
});

router.get('/reports/lectures', async (req, res) => {
    const { teacherId, startDate, endDate } = req.query;
    let lectureFilter = { schoolId: req.school._id };
    if (teacherId) lectureFilter.teacherId = teacherId;
    if (startDate) lectureFilter.date = { $gte: new Date(startDate) };
    if (endDate) lectureFilter.date = { ...lectureFilter.date, $lte: new Date(endDate) };
    const lectures = await Lecture.find(lectureFilter).populate('teacherId').sort({ date: -1 });
    const teachers = await User.find({ role: 'teacher', schoolId: req.school._id });
    res.render('principal/lecture-report', { lectures, teachers, selectedTeacher: teacherId, startDate, endDate, title: 'Lecture Analysis Reports' });
});

router.get('/reports/student-count', async (req, res) => {
    const { teacherId, startDate, endDate } = req.query;
    let teacherFilter = { role: 'teacher', schoolId: req.school._id };
    if (teacherId) teacherFilter._id = teacherId;
    const teachers = await User.find(teacherFilter);
    let studentData = [];
    for (const teacher of teachers) {
        let records = teacher.studentAttendance || [];
        if (startDate) records = records.filter(sa => sa.date >= startDate);
        if (endDate) records = records.filter(sa => sa.date <= endDate);
        studentData.push({ teacher: teacher.name, records });
    }
    res.render('principal/student-count-report', { studentData, teachers: await User.find({ role: 'teacher', schoolId: req.school._id }), selectedTeacher: teacherId, startDate, endDate, title: 'Student Count Reports' });
});

module.exports = router;