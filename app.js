require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const connectDB = require('./config/database');
const { attachUser } = require('./middleware/auth');

connectDB();
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(attachUser);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use('/captures', express.static(path.join(__dirname, 'captures')));
// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/ministry', require('./routes/ministry'));
app.use('/principal', require('./routes/principal'));
app.use('/teacher', require('./routes/teacher'));
app.use('/recording', require('./routes/recording'));
app.use('/upload', require('./routes/upload'));

// Health check
app.get('/health', (req, res) => res.json({ status: 'OK' }));

// Error handlers
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).render('error', { error: err.message });
});
app.use((req, res) => res.status(404).render('404'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));