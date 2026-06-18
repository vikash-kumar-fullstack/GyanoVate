const mongoose = require('mongoose');
const schoolSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    code: { type: String, required: true, unique: true },
    address: String,
    district: String,
    state: String,
    principalPlainPassword: { type: String },
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    principalId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
module.exports = mongoose.model('School', schoolSchema);