const express = require('express');
const router = express.Router();
router.get('/', (req, res) => {
    if (req.session.userId) {
        const role = req.session.userRole;
        if (role === 'ministry') return res.redirect('/ministry/dashboard');
        if (role === 'principal') return res.redirect('/principal/dashboard');
        if (role === 'teacher') return res.redirect('/teacher/dashboard');
    }
    res.render('index', { title: 'TeachWithTech' });
});
router.get('/about', (req, res) => res.render('about', { title: 'About' }));
module.exports = router;