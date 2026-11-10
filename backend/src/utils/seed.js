/**
 * Create the first admin.
 *
 *   SEED_ADMIN_EMAIL=head@yourschool.com SEED_ADMIN_PASSWORD='...' pnpm seed
 *
 * This used to run `User.deleteMany()` and then insert `admin@school.com` with
 * the password `password123`. Run against a live database that deleted every
 * account in the school and left a publicly guessable administrator behind, so
 * it now does neither:
 *
 *   - it never deletes anything, and refuses to run if an admin already exists
 *   - the email and password come from the environment, never from the source
 *   - the account goes through User.create, so the model's hooks hash the
 *     password and stamp passwordChangedAt like any other account
 */
const User = require('../models/User');
const connectDB = require('../config/db');

const MIN_PASSWORD_LENGTH = 12;

const seedAdmin = async () => {
  const email = String(process.env.SEED_ADMIN_EMAIL || '')
    .trim()
    .toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || '';

  if (!email || password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `❌ Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (at least ${MIN_PASSWORD_LENGTH} characters).`,
    );
    process.exit(1);
  }

  await connectDB();

  try {
    const existing = await User.exists({ role: 'Admin' });
    if (existing) {
      console.error(
        '❌ An admin account already exists. Nothing was changed. ' +
          'Add further admins on the Administrators page in the portal.',
      );
      process.exit(1);
    }

    await User.create({
      firstName: 'Super',
      lastName: 'Admin',
      email,
      password,
      role: 'Admin',
    });

    console.log(`✅ Admin created: ${email}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin:', error.message);
    process.exit(1);
  }
};

seedAdmin();
