const axios = require('axios');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const assemblyAI = require('./assemblyAI.js');

class YouTubeTranscriptService {
    constructor() {
        this.methods = [
            this.tryPackage1.bind(this),
            this.tryPackage2.bind(this),
            this.tryScraping.bind(this),
            this.tryAudioFallback.bind(this)
        ];
    }

    async getTranscript(videoUrl) {
        console.log('📹 Fetching transcript for:', videoUrl);
        const videoId = this.extractVideoId(videoUrl);

        for (let i = 0; i < this.methods.length; i++) {
            try {
                const transcript = await this.methods[i](videoId, videoUrl);
                if (transcript && transcript.length > 50) {
                    console.log(`✅ Method ${i + 1} success`);
                    return transcript;
                }
            } catch (err) {
                console.log(`❌ Method ${i + 1} failed:`, err.message);
            }
        }

        throw new Error('All transcript methods failed');
    }

    async tryPackage1(videoId) {
        const { YoutubeTranscript } = require('youtube-transcript-api');
        const data = await YoutubeTranscript.fetchTranscript(videoId);
        return data.map(i => i.text).join(' ');
    }

    async tryPackage2(videoId) {
        const YouTubeTranscript = require('youtube-transcript');
        return await YouTubeTranscript.getTranscript(videoId);
    }

    async tryScraping(videoId) {
        const res = await axios.get(`https://www.youtube.com/watch?v=${videoId}`);
        const match = res.data.match(/"text":"([^"]+)"/g);
        if (!match) throw new Error('No transcript');
        return match.map(m => m.replace(/"text":"([^"]+)"/, '$1')).join(' ');
    }

    async tryAudioFallback(videoId, videoUrl) {
        console.log('🎧 Using audio fallback');

        const filePath = path.join(__dirname, '../temp/audio.mp3');

        await new Promise((resolve, reject) => {
            const stream = ytdl(videoUrl, { filter: 'audioonly' });
            const write = fs.createWriteStream(filePath);
            stream.pipe(write);
            write.on('finish', resolve);
            write.on('error', reject);
        });

        const audioUrl = await this.uploadToCloudinary(filePath);
        const transcript = await assemblyAI.transcribeAudio(audioUrl);

        return transcript.text;
    }

    async uploadToCloudinary(filePath) {
        const cloudinary = require('cloudinary').v2;

        const result = await cloudinary.uploader.upload(filePath, {
            resource_type: 'video',
            folder: 'lecture-audio'
        });

        return result.secure_url;
    }

    extractVideoId(url) {
        const match = url.match(/(?:youtube\.com\/.*v=|youtu\.be\/)([^&]+)/);
        return match ? match[1] : null;
    }
}

module.exports = new YouTubeTranscriptService();