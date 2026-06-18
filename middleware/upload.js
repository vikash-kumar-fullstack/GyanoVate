const multer = require('multer');
const path = require('path');
const fs = require('fs');
const audioDir = path.join(__dirname, '../public/audio');
if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, audioDir),
    filename: (req, file, cb) => cb(null, 'lecture-' + Date.now() + path.extname(file.originalname))
});
const fileFilter = (req, file, cb) => file.mimetype.startsWith('audio/') ? cb(null, true) : cb(new Error('Only audio'));
module.exports = multer({ storage, fileFilter, limits: { fileSize: 100 * 1024 * 1024 } });