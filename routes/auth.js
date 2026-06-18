const express = require('express');
const User = require('../models/User');
const router = express.Router();
router.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('auth/login', { error: null, message: req.query.message });
});
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
        return res.render('auth/login', { error: 'Invalid credentials', message: null });
    }
    req.session.userId = user._id;
    req.session.userRole = user.role;
    if (user.role === 'ministry') return res.redirect('/ministry/dashboard');
    if (user.role === 'principal') return res.redirect('/principal/dashboard');
    if (user.role === 'teacher') return res.redirect('/teacher/dashboard');
    res.redirect('/');
});
router.post('/logout', (req, res) => { req.session.destroy(); res.redirect('/auth/login'); });
module.exports = router;