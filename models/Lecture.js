const mongoose = require('mongoose');
const { SUBJECTS } = require('./Subject');
const lectureSchema = new mongoose.Schema({
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Schedule' },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
    classNum: { type: Number, enum: [1,2,3,4,5,6,7,8,9,10], required: true },
    subject: { type: String, enum: SUBJECTS, required: true },
    topic: { type: String, required: true },
    title: { type: String, required: true },
    date: Date,
    startTime: String,
    endTime: String,
    youtubeVideo: { url: String, transcript: String, transcriptGenerated: Boolean, transcriptSource: { type: String, enum: ['manual','youtube','none'], default:'none' } },
    recording: { audioUrl: String, transcript: String, startTime: Date, endTime: Date, duration: Number, wordCount: Number },
    analysis: { humanVoiceProbability: Number, transcriptMatchPercentage: Number, grokAnalysis: Object, status: { type: String, enum: ['pending','processing','completed','failed'], default:'pending' } },
    status: { type: String, enum: ['scheduled','recording','completed','analyzed','cancelled'], default:'scheduled' }
}, { timestamps: true });
module.exports = mongoose.model('Lecture', lectureSchema);