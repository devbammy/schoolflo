const bcrypt = require('bcryptjs');
const User = require('../models/User');
const connectDB = require('../config/db');

connectDB();

const seedUsers = async () => {
  try {
    await User.deleteMany();

    const hashedPassword = await bcrypt.hash('password123', 10);

    const users = [
      {
        firstName: 'Super',
        lastName: 'Admin',
        email: 'admin@school.com',
        password: hashedPassword,
        role: 'Admin',
        isVerified: true,
        status: 'active',
      },
      {
        firstName: 'Class',
        lastName: 'Teacher',
        email: 'teacher@school.com',
        password: hashedPassword,
        role: 'Teacher',
        isVerified: true,
        status: 'active',
      },
      {
        firstName: 'Emmanuel',
        lastName: 'Bamidele',
        email: 'student@school.com',
        password: hashedPassword,
        role: 'Student',
        isVerified: true,
        status: 'active',
      },
    ];

    await User.insertMany(users);
    console.log('✅ Users seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
};

seedUsers();
