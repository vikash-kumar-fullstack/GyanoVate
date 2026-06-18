const User = require('../models/User');

const requireAuth = (req, res, next) => {
    if (!req.session.userId) return res.redirect('/auth/login');
    next();
};

const requireRole = (...roles) => {
    return async (req, res, next) => {
        if (!req.session.userId) return res.redirect('/auth/login');
        const user = await User.findById(req.session.userId);
        if (!user || !roles.includes(user.role)) {
            return res.status(403).render('error', { error: 'Access denied' });
        }
        req.user = user;
        next();
    };
};

const attachUser = async (req, res, next) => {
    if (req.session.userId) {
        const user = await User.findById(req.session.userId);
        if (user) { req.user = user; res.locals.user = user; res.locals.userRole = user.role; }
    }
    next();
};

module.exports = { requireAuth, requireRole, attachUser };