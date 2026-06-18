require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const seedMinistry = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        const existing = await User.findOne({ email: 'ministry@education.gov.in' });
        if (existing) {
            console.log('Ministry user already exists');
            process.exit();
        }
        
        // Do NOT hash manually – the model's pre-save hook will do it
        const ministry = new User({
            name: 'Education Ministry',
            email: 'ministry@gmail.com',
            password: 'admin123',   // plain text
            role: 'ministry',
            isActive: true
        });
        
        await ministry.save();
        console.log('✅ Ministry user created!');
        console.log('   Email: ministry@education.gov.in');
        console.log('   Password: Admin@123');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedMinistry();