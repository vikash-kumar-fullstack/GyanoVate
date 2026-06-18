const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    plainPassword: { type: String },
    role: {
        type: String,
        enum: ['ministry', 'principal', 'teacher'],
        required: true
    },
    schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
    isActive: { type: Boolean, default: true }
}, { timestamps: true, discriminatorKey: 'role' });

userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});
userSchema.methods.comparePassword = async function(candidate) {
    return bcrypt.compare(candidate, this.password);
};

const User = mongoose.model('User', userSchema);

// Discriminators
const ministrySchema = new mongoose.Schema({
    permissions: [{ type: String, enum: ['create_school', 'view_all_reports'] }]
});
const principalSchema = new mongoose.Schema({ phone: String });
const teacherSchema = new mongoose.Schema({
    subjects: [{ type: String, enum: ['Math','Science','Hindi','English','SST'] }],
    classes: [{ type: Number, enum: [1,2,3,4,5,6,7,8,9,10] }],
    classTeacherOf: { type: Number, enum: [1,2,3,4,5,6,7,8,9,10], unique: true, sparse: true },
    imageUrl: String,
    cloudinaryId: String,
    attendance: [{ date: String, time: String, faceMatched: Boolean, locationMatched: Boolean, verified: Boolean }],
    studentAttendance: [{ 
        date: String, 
        time: String, 
        imageUrl: String, 
        studentCount: Number, 
        locationMatched: Boolean,
        cloudinaryId: String
    }]
});

User.discriminator('ministry', ministrySchema);
User.discriminator('principal', principalSchema);
User.discriminator('teacher', teacherSchema);

module.exports = User;