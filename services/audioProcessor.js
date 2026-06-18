const fs = require('fs');
const path = require('path');
const axios = require('axios');
const assemblyAIService = require('./assemblyAI');

class AudioProcessor {
    constructor() {
       this.uploadDir = path.join(process.cwd(), 'public/audio');
    }

    async processAudioFile(filename) {
        try {
            console.log('\n🔊 [AUDIO PROCESSOR] Starting audio processing...');
            console.log('🔊 [AUDIO PROCESSOR] File:', filename);
            
            const filePath = path.join(this.uploadDir, filename);
            
            if (!fs.existsSync(filePath)) {
                throw new Error('Audio file not found: ' + filename);
            }

            console.log('🔊 [AUDIO PROCESSOR] File exists, size:', fs.statSync(filePath).size, 'bytes');
            
            // Upload file directly to AssemblyAI
            console.log('🔊 [AUDIO PROCESSOR] Uploading file to AssemblyAI...');
            const audioUrl = await this.uploadToAssemblyAI(filePath);
            
            console.log('🔊 [AUDIO PROCESSOR] Calling AssemblyAI service with uploaded file...');
            const result = await assemblyAIService.transcribeAudio(audioUrl);
            
            // Calculate word count
            const wordCount = result.text ? result.text.split(/\s+/).length : 0;
            
            console.log('✅ [AUDIO PROCESSOR] Audio processing completed!');
            console.log('✅ [AUDIO PROCESSOR] Transcript length:', result.text.length, 'chars');
            console.log('✅ [AUDIO PROCESSOR] Word count:', wordCount);
            console.log('✅ [AUDIO PROCESSOR] Confidence score:', result.confidence);
            
            return {
                text: result.text,
                words: result.words || [],
                confidence: result.confidence,
                audioDuration: result.audioDuration,
                wordCount: wordCount
            };

        } catch (error) {
            console.error('❌ [AUDIO PROCESSOR] Processing failed:', error.message);
            throw error;
        }
    }

    async uploadToAssemblyAI(filePath) {
        try {
            console.log('📤 [AUDIO PROCESSOR] Uploading file to AssemblyAI...');
            
            const fileData = fs.readFileSync(filePath);
            
            const response = await axios.post(
                'https://api.assemblyai.com/v2/upload',
                fileData,
                {
                    headers: {
                        'Authorization': process.env.ASSEMBLYAI_API_KEY,
                        'Content-Type': 'application/octet-stream'
                    },
                    timeout: 30000
                }
            );

            console.log('✅ [AUDIO PROCESSOR] File uploaded successfully:', response.data.upload_url);
            return response.data.upload_url;

        } catch (error) {
            console.error('❌ [AUDIO PROCESSOR] File upload failed:', error.message);
            throw new Error(`File upload failed: ${error.message}`);
        }
    }

    async cleanupAudioFile(filename) {
        try {
            console.log('🧹 [AUDIO PROCESSOR] Cleaning up audio file:', filename);
            const filePath = path.join(this.uploadDir, filename);
            
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
                console.log('✅ [AUDIO PROCESSOR] File cleaned up successfully');
            } else {
                console.log('🔊 [AUDIO PROCESSOR] File already removed');
            }
        } catch (error) {
            console.error('❌ [AUDIO PROCESSOR] Cleanup failed:', error.message);
        }
    }
}

module.exports = new AudioProcessor();