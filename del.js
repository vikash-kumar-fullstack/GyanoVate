require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const deleteMinistry = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const result = await User.deleteOne({ email: 'ministry@education.gov.in' });
        if (result.deletedCount === 1) {
            console.log('✅ Existing ministry user deleted');
        } else {
            console.log('No ministry user found to delete');
        }
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

deleteMinistry();