require('dotenv').config();
const { GoogleGenAI } = require("@google/genai");

class GrokAIService {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY;

        if (!this.apiKey) {
            console.log("❌ No GEMINI_API_KEY found in .env");
        }

        this.ai = new GoogleGenAI({
            apiKey: this.apiKey
        });
    }

    async analyzeTranscripts(originalTranscript, recordedTranscript, lectureInfo) {
        try {
            console.log("\n🤖 ===== STARTING GEMINI ANALYSIS =====");

            const prompt = this.createAnalysisPrompt(
                originalTranscript,
                recordedTranscript,
                lectureInfo
            );

            // ✅ WORKING MODEL
            const response = await this.ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: prompt
            });

            const text = response.text;

            console.log("📩 RAW RESPONSE:", text.substring(0, 300));

            const parsed = this.safeJSONParse(text);

            return { 
                ...parsed,
                _metadata: {
                    model: "gemini-2.0-flash",
                    timestamp: new Date().toISOString(),
                    provider: "google-genai"
                }
            };

        } catch (error) {
            console.error("❌ GEMINI ERROR:", error);

            return this.getSmartMockAnalysis(
                originalTranscript,
                recordedTranscript,
                lectureInfo
            );
        }
    }

    createAnalysisPrompt(original, recorded, lectureInfo) {
        return `
Analyze similarity between two lecture transcripts.

Title: ${lectureInfo.title}

Reference:
${(original || "").slice(0, 800)}

Recorded:
${(recorded || "").slice(0, 800)}

Return ONLY JSON:

{
"matchPercentage": number,
"conceptualSimilarity": "high|medium|low",
"keyPointsCovered": number,
"totalKeyPoints": number,
"detailedAnalysis": "text",
"strengths": ["a","b"],
"improvementAreas": ["a","b"],
"overallAssessment": "text"
}
`;
    }

    safeJSONParse(text) {
        try {
            const start = text.indexOf("{");
            const end = text.lastIndexOf("}");

            const parsed = JSON.parse(text.substring(start, end + 1));

            return parsed;
        } catch {
            return this.getSmartMockAnalysis("", "", { title: "Fallback" });
        }
    }

    getSmartMockAnalysis(original, recorded, lectureInfo) {
        return {
            matchPercentage: 75,
            conceptualSimilarity: "medium",
            keyPointsCovered: 7,
            totalKeyPoints: 10,
            detailedAnalysis: `Fallback for ${lectureInfo.title}`,
            strengths: ["Basic coverage"],
            improvementAreas: ["Improve depth"],
            overallAssessment: "Average lecture",
            _metadata: { fallback: true }
        };
    }

    async testConnection() {
        try {
            const res = await this.ai.models.generateContent({
                model: "gemini-3-flash-preview",
                contents: "Say OK"
            });

            console.log("✅ Gemini working:", res.text);
        } catch (err) {
            console.error("❌ Gemini failed:", err);
        }
    }
}

module.exports = new GrokAIService();