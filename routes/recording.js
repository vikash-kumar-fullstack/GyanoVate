const express = require('express');
const { requireRole } = require('../middleware/auth');
const Lecture = require('../models/Lecture');
const audioProcessor = require('../services/audioProcessor');
const grokAIService = require('../services/grokAI');
const youtubeService = require('../services/youtubeTranscript');

const router = express.Router();
router.use(requireRole('teacher'));


// =======================
// START RECORDING
// =======================
router.post('/start/:lectureId', async (req, res) => {
    try {
        const lecture = await Lecture.findOne({
            _id: req.params.lectureId,
            teacherId: req.user._id
        });

        if (!lecture) {
            return res.status(404).json({ success: false, error: 'Lecture not found' });
        }

        const currentTime = new Date().toTimeString().slice(0,5);

        if (currentTime < lecture.startTime || currentTime > lecture.endTime) {
            return res.status(400).json({
                success: false,
                error: 'Outside lecture time'
            });
        }

        if (!lecture.recording) lecture.recording = {};

        lecture.recording.startTime = new Date();
        lecture.status = 'recording';

        await lecture.save();

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// =======================
// STOP RECORDING
// =======================
router.post('/stop/:lectureId', async (req, res) => {
    try {
        const { audioUrl, filename, duration } = req.body;

        const lecture = await Lecture.findOne({
            _id: req.params.lectureId,
            teacherId: req.user._id
        });

        if (!lecture) {
            return res.status(404).json({ success: false, error: 'Lecture not found' });
        }

        if (!lecture.recording) lecture.recording = {};

        lecture.recording.endTime = new Date();
        lecture.recording.audioUrl = audioUrl;
        lecture.recording.duration = duration;
        lecture.status = 'completed';

        await lecture.save();

        // 🔥 IMPORTANT
        await processLectureAnalysis(lecture._id, filename);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


// =======================
// ANALYSIS PIPELINE
// =======================
async function processLectureAnalysis(lectureId, filename) {
    try {
        console.log("\n🎯 START ANALYSIS");

        const lecture = await Lecture.findById(lectureId);
        if (!lecture) return;

        lecture.analysis = { status: 'processing' };
        await lecture.save();

        let recordedTranscript = '';
        let confidence = 0;

        // 🎙️ AUDIO → TEXT
        if (filename) {
            const result = await audioProcessor.processAudioFile(filename);

            recordedTranscript = result.text;
            confidence = result.confidence;

            lecture.recording.transcript = recordedTranscript;
            lecture.recording.wordCount = result.wordCount;

            lecture.analysis.humanVoiceProbability = confidence;

            await lecture.save();
        }

        // 📹 YOUTUBE TRANSCRIPT
        if (lecture.youtubeVideo?.url && !lecture.youtubeVideo.transcript) {
            try {
                const ytTranscript = await youtubeService.getTranscript(
                    lecture.youtubeVideo.url
                );

                lecture.youtubeVideo.transcript = ytTranscript;
                lecture.youtubeVideo.transcriptGenerated = true;
                lecture.youtubeVideo.transcriptSource = "youtube";

                await lecture.save();
            } catch (err) {
                console.log("YouTube transcript failed:", err.message);
            }
        }

        // 🤖 GEMINI ANALYSIS
        if (recordedTranscript && recordedTranscript.length > 0) {
            try {
                const ai = await grokAIService.analyzeTranscripts(
                    lecture.youtubeVideo?.transcript || "No reference",
                    recordedTranscript,
                    { title: lecture.title }
                );

                lecture.analysis.transcriptMatchPercentage = ai.matchPercentage;
                lecture.analysis.grokAnalysis = ai;
                lecture.analysis.status = 'completed';

            } catch (err) {
                lecture.analysis.status = 'failed';
            }
        }

        lecture.status = 'analyzed';
        await lecture.save();

        console.log("✅ ANALYSIS COMPLETE");

    } catch (err) {
        console.error("❌ ANALYSIS ERROR:", err);
    }
}

module.exports = router;