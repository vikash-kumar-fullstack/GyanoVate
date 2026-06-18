const express = require('express');
const { requireAuth, attachUser } = require('../middleware/auth');
const User = require('../models/User');
const Lecture = require('../models/Lecture');
const router = express.Router();
router.use(requireAuth, attachUser);

router.get('/attendance', async (req, res) => {
    const { role, schoolId } = req.user;
    let teachers = [];
    if (role === 'ministry') {
        teachers = await User.find({ role: 'teacher' });
    } else if (role === 'principal') {
        teachers = await User.find({ role: 'teacher', schoolId });
    } else if (role === 'teacher') {
        teachers = [req.user];
    }
    const { teacherId, startDate, endDate } = req.query;
    let teacherAttendance = [];
    for (const teacher of teachers) {
        let attendance = teacher.attendance || [];
        if (startDate) attendance = attendance.filter(a => a.date >= startDate);
        if (endDate) attendance = attendance.filter(a => a.date <= endDate);
        if (teacherId && teacher._id.toString() === teacherId) {
            teacherAttendance = attendance;
            break;
        }
        teacherAttendance.push({ teacher: teacher.name, attendance });
    }
    res.render('reports/attendance-report', { teachers, teacherAttendance, startDate, endDate, title: 'Attendance Report' });
});
router.get('/lectures', async (req, res) => {
    const { role, schoolId } = req.user;
    let lectures = [];
    if (role === 'ministry') {
        lectures = await Lecture.find().populate('teacherId');
    } else if (role === 'principal') {
        lectures = await Lecture.find({ schoolId }).populate('teacherId');
    } else if (role === 'teacher') {
        lectures = await Lecture.find({ teacherId: req.user._id }).populate('teacherId');
    }
    const { teacherId, startDate, endDate, lectureId } = req.query;
    let filtered = lectures;
    if (teacherId) filtered = filtered.filter(l => l.teacherId._id.toString() === teacherId);
    if (startDate) filtered = filtered.filter(l => l.date >= new Date(startDate));
    if (endDate) filtered = filtered.filter(l => l.date <= new Date(endDate));
    if (lectureId) filtered = filtered.filter(l => l._id.toString() === lectureId);
    const teachers = await User.find({ role: 'teacher', schoolId: req.user.schoolId });
    res.render('reports/lecture-report', { lectures: filtered, teachers, startDate, endDate, title: 'Lecture Report' });
});
module.exports = router;