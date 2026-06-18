const mongoose = require('mongoose');
const SUBJECTS = ['Math','Science','Hindi','English','SST'];
const TOPICS_BY_SUBJECT = {
    Math: ['Number System','Algebra','Geometry','Trigonometry','Mensuration','Statistics','Probability','Arithmetic','Calculus Basics','Coordinate Geometry'],
    Science: ['Matter','Force & Motion','Energy','Light & Sound','Electricity','Atoms & Molecules','Cells & Tissues','Periodic Table','Ecosystem','Human Body'],
    Hindi: ['वर्णमाला','संज्ञा','सर्वनाम','क्रिया','विशेषण','काल','वाक्य रचना','मुहावरे','पत्र लेखन','कहानी लेखन'],
    English: ['Nouns & Pronouns','Verbs & Tenses','Adjectives & Adverbs','Sentence Structure','Prepositions','Conjunctions & Interjections','Punctuation','Reading Comprehension','Essay Writing','Story Writing'],
    SST: ['Ancient Civilizations','Medieval History','Modern History','Indian Constitution','Geography of India','World Geography','Economics Basics','Democracy','Civics','Environmental Studies']
};
const topicSchema = new mongoose.Schema({ name: String, subject: String, order: Number });
const subjectSchema = new mongoose.Schema({
    name: { type: String, enum: SUBJECTS, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    topics: [topicSchema],
    isActive: Boolean
});
subjectSchema.pre('save', function(next) {
    if (this.isNew && (!this.topics || this.topics.length === 0)) {
        this.topics = TOPICS_BY_SUBJECT[this.name].map((n,i) => ({ name:n, subject:this.name, order:i+1 }));
    }
    next();
});
module.exports = { Subject: mongoose.model('Subject', subjectSchema), SUBJECTS, TOPICS_BY_SUBJECT };