const express = require('express');
const { requireRole } = require('../middleware/auth');

const Lecture = require('../models/Lecture');
const User = require('../models/User');
const School = require('../models/School');
const router = express.Router();
router.use(requireRole('teacher'));
const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');




// ✅ DASHBOARD
router.get('/dashboard', async (req, res) => {
    const today = new Date();
    today.setHours(0,0,0,0);

    const lectures = await Lecture.find({
        teacherId: req.user._id,
        date: {
            $gte: today,
            $lt: new Date(today.getTime() + 86400000)
        }
    }).sort({ startTime: 1 });

    const currentTime = new Date().toTimeString().slice(0,5);

    const currentLecture = lectures.find(
        l => currentTime >= l.startTime && currentTime <= l.endTime
    );

    res.render('teacher/dashboard', {
        lectures,
        currentLecture,
        teacher: req.user,
        title: 'Dashboard'
    });
});


// ✅ RECORDING PAGE
router.get('/recording/:lectureId', async (req, res) => {
    const lecture = await Lecture.findOne({
        _id: req.params.lectureId,
        teacherId: req.user._id
    });

    if (!lecture) return res.status(404).render('error', { error: 'Lecture not found' });

    res.render('teacher/recording', { lecture });
});


// ✅ LECTURES LIST
router.get('/lectures', async (req, res) => {
    const lectures = await Lecture.find({
        teacherId: req.user._id
    }).sort({ date: -1 });

    res.render('teacher/lectures', { lectures });
});


// ✅ LECTURE DETAILS
router.get('/lectures/:id', async (req, res) => {
    const lecture = await Lecture.findOne({
        _id: req.params.id,
        teacherId: req.user._id
    });

    if (!lecture) return res.status(404).render('error', { error: 'Lecture not found' });

    res.render('teacher/lecture-details', { lecture });
});

module.exports = router;
router.get('/markAttendance', (req, res) => {
    res.render('teacher/markAttendance', { teacher: req.user, title: 'Mark Attendance' });
});


const Teacher = mongoose.model('teacher');

router.post('/mark-student-attendance', async (req, res) => {
    try {
        const { email } = req.body;

        const teacher = await Teacher.findOne({ email });

        if (!teacher) {
            return res.status(404).json({ message: "Teacher not found" });
        }

        const today = new Date().toISOString().split('T')[0];

        const already = teacher.studentAttendance.some(a => a.date === today);

        if (already) {
            return res.status(400).json({
                message: "Already marked today"
            });
        }

        const pyRes = await fetch('http://localhost:5002/capture_students');
        const data = await pyRes.json();

        await Teacher.updateOne(
            { email },
            {
                $push: {
                    studentAttendance: {
                        date: today,
                        time: new Date().toLocaleTimeString(),
                        studentCount: data.studentCount,
                        imageUrl: data.imagePath,
                        locationMatched: true
                    }
                }
            }
        );

        res.json({
            message: "Saved successfully",
            data
        });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});
router.get('/attendance-status', async (req, res) => {
    const { email } = req.query;
    const teacher = await User.findOne({ email, role: 'teacher' });
    const today = new Date().toISOString().split('T')[0];
    const todayAttendance = teacher?.attendance?.find(a => a.date === today);
    res.json({ success: true, data: { attendanceMarked: !!todayAttendance, attendance: todayAttendance || null } });
});

router.get('/student-attendance-status', async (req, res) => {
    const { email } = req.query;
    const teacher = await User.findOne({ email, role: 'teacher' });
    const today = new Date().toISOString().split('T')[0];
    const todayRecord = teacher?.studentAttendance?.find(sa => sa.date === today);
    res.json({ success: true, data: { marked: !!todayRecord } });
});

router.post('/check-location', async (req, res) => {
    const { latitude, longitude, email } = req.body;
    const teacher = await User.findOne({ email, role: 'teacher' });
    if (!teacher || !teacher.schoolId) return res.json({ withinRange: false, distance: null });
    const school = await School.findById(teacher.schoolId);
    if (!school || !school.latitude || !school.longitude) return res.json({ withinRange: false, distance: null });
    const distance = getDistanceFromLatLonInMeters(latitude, longitude, school.latitude, school.longitude);
    res.json({ withinRange: distance <= 500, distance: Math.round(distance) });
});

router.post('/capture-classroom', async (req, res) => {
    try {
        const teacher = req.user;
        const today = new Date().toISOString().split('T')[0];
        const already = teacher.studentAttendance?.some(sa => sa.date === today);
        if (already) return res.json({ success: false, error: "Already recorded today" });
        const pythonScript = path.join(__dirname, '../python/capture_and_count.py');
        const output = await new Promise((resolve, reject) => {
            exec(`python "${pythonScript}"`, (err, stdout, stderr) => {
                if (err) reject(err);
                else resolve(stdout);
            });
        });
        const match = output.match(/STUDENTS_COUNT: (\d+)/);
        const studentCount = match ? parseInt(match[1]) : 0;
        const imagePath = path.join(__dirname, '../python/captures/latest.jpg');
        if (!fs.existsSync(imagePath)) throw new Error("Image not captured");
        const uploadResult = await cloudinary.uploader.upload(imagePath, { folder: 'student_attendance' });
        fs.unlinkSync(imagePath);
        const now = new Date();
        teacher.studentAttendance.push({
            date: today,
            time: now.toTimeString().slice(0,5),
            imageUrl: uploadResult.secure_url,
            studentCount: studentCount,
            locationMatched: true,
            cloudinaryId: uploadResult.public_id
        });
        await teacher.save();
        res.json({ success: true, studentCount, imageUrl: uploadResult.secure_url });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// Teacher reports
router.get('/reports/attendance', async (req, res) => {
    const { startDate, endDate } = req.query;
    let attendance = req.user.attendance || [];
    if (startDate) attendance = attendance.filter(a => a.date >= startDate);
    if (endDate) attendance = attendance.filter(a => a.date <= endDate);
    res.render('teacher/attendance-report', { attendance, startDate, endDate, teacher: req.user, title: 'My Attendance' });
});

router.get('/reports/lectures', async (req, res) => {
    const { startDate, endDate } = req.query;
    let lectureFilter = { teacherId: req.user._id };
    if (startDate) lectureFilter.date = { $gte: new Date(startDate) };
    if (endDate) lectureFilter.date = { ...lectureFilter.date, $lte: new Date(endDate) };
    const lectures = await Lecture.find(lectureFilter).sort({ date: -1 });
    res.render('teacher/lecture-report', { lectures, startDate, endDate, teacher: req.user, title: 'My Lecture Analysis' });
});

router.get('/reports/student-count', async (req, res) => {
    const { startDate, endDate } = req.query;
    let records = req.user.studentAttendance || [];
    if (startDate) records = records.filter(sa => sa.date >= startDate);
    if (endDate) records = records.filter(sa => sa.date <= endDate);
    res.render('teacher/student-count-report', { records, startDate, endDate, teacher: req.user, title: 'Student Count Reports' });
});

function getDistanceFromLatLonInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

module.exports = router;