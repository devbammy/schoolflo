const db = require('../setup/db');

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ success: true, queued: true }),
  enqueueBulkEmail: jest.fn().mockResolvedValue({ queued: 0, total: 0 }),
  startJobQueue: jest.fn(),
  stopJobQueue: jest.fn(),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars';
process.env.JWT_EXPIRE = '1h';
process.env.JWT_REFRESH_EXPIRE = '30d';

const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const Session = require('../../src/models/Session');

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
});

const makeUser = (overrides = {}) =>
  User.create({
    firstName: 'Ada',
    lastName: 'Obi',
    email: 'ada@school.ng',
    password: 'correct-horse-battery',
    role: 'Teacher',
    ...overrides,
  });

describe('User password handling', () => {
  it('hashes the password and never stores it in plain text', async () => {
    const user = await makeUser();
    const stored = await User.findById(user._id).select('+password');

    expect(stored.password).not.toBe('correct-horse-battery');
    expect(stored.password).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it('excludes the password from queries by default', async () => {
    const user = await makeUser();
    const stored = await User.findById(user._id);

    expect(stored.password).toBeUndefined();
  });

  it('verifies a correct password and rejects a wrong one', async () => {
    const user = await makeUser();
    const stored = await User.findById(user._id).select('+password');

    await expect(stored.comparePassword('correct-horse-battery')).resolves.toBe(
      true,
    );
    await expect(stored.comparePassword('wrong')).resolves.toBe(false);
  });

  it('re-hashes when the password changes, and stamps passwordChangedAt', async () => {
    const user = await makeUser();
    const doc = await User.findById(user._id).select('+password');

    // Capture the string, not the document — saving mutates the doc in place.
    const originalHash = doc.password;

    doc.password = 'a-brand-new-password';
    await doc.save();

    const after = await User.findById(user._id).select('+password');
    expect(after.password).not.toBe(originalHash);
    expect(after.passwordChangedAt).toBeDefined();
    await expect(after.comparePassword('a-brand-new-password')).resolves.toBe(
      true,
    );
  });
});

describe('Token invalidation on password change', () => {
  it('rejects a token issued before the password changed', async () => {
    const user = await makeUser();

    // Issued a minute ago.
    const issuedAt = Math.floor(Date.now() / 1000) - 60;

    const stored = await User.findById(user._id).select('+password');
    stored.password = 'rotated-password';
    await stored.save();

    const fresh = await User.findById(user._id);
    expect(fresh.changedPasswordAfter(issuedAt)).toBe(true);
  });

  it('accepts a token issued after the password changed', async () => {
    const user = await makeUser();
    const fresh = await User.findById(user._id);

    const issuedAt = Math.floor(Date.now() / 1000) + 60;
    expect(fresh.changedPasswordAfter(issuedAt)).toBe(false);
  });
});

describe('Access tokens', () => {
  it('is short lived — an unrevokable token must not last for weeks', async () => {
    const user = await makeUser();
    const decoded = jwt.decode(user.generateAccessToken());

    const lifetimeHours = (decoded.exp - decoded.iat) / 3600;
    expect(lifetimeHours).toBeLessThanOrEqual(24);
  });

  it('carries the id and role the auth middleware relies on', async () => {
    const user = await makeUser();
    const decoded = jwt.verify(
      user.generateAccessToken(),
      process.env.JWT_SECRET,
    );

    expect(String(decoded.id)).toBe(String(user._id));
    expect(decoded.role).toBe('Teacher');
  });
});

describe('Sessions', () => {
  it('stores only a hash of the refresh token', async () => {
    const user = await makeUser();
    const token = user.generateRefreshToken();

    await Session.create({
      user: user._id,
      tokenHash: Session.hashToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const session = await Session.findOne({ user: user._id });

    // A dump of this collection must not be replayable against the API.
    expect(session.tokenHash).not.toBe(token);
    expect(session.tokenHash).toHaveLength(64); // sha256 hex
  });

  it('finds a session by hashing the presented token', async () => {
    const user = await makeUser();
    const token = user.generateRefreshToken();

    await Session.create({
      user: user._id,
      tokenHash: Session.hashToken(token),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const found = await Session.findOne({
      tokenHash: Session.hashToken(token),
    });
    expect(found).not.toBeNull();
  });

  it('does not match a token that was never issued', async () => {
    const user = await makeUser();
    await Session.create({
      user: user._id,
      tokenHash: Session.hashToken(user.generateRefreshToken()),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const found = await Session.findOne({
      tokenHash: Session.hashToken('some-other-token'),
    });
    expect(found).toBeNull();
  });

  it('revoking a session makes its token unusable', async () => {
    const user = await makeUser();
    const token = user.generateRefreshToken();
    const hash = Session.hashToken(token);

    await Session.create({
      user: user._id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await Session.deleteOne({ tokenHash: hash });

    // The JWT itself is still cryptographically valid...
    expect(jwt.verify(token, process.env.JWT_REFRESH_SECRET)).toBeTruthy();
    // ...but with no session behind it, refresh must fail. This is what makes
    // logout actually revoke access.
    expect(await Session.findOne({ tokenHash: hash })).toBeNull();
  });

  it('logout-all clears every device for that user only', async () => {
    const user = await makeUser();
    const other = await makeUser({ email: 'other@school.ng' });

    for (let i = 0; i < 3; i++) {
      await Session.create({
        user: user._id,
        tokenHash: Session.hashToken(`token-${i}`),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
      });
    }
    await Session.create({
      user: other._id,
      tokenHash: Session.hashToken('other-token'),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    await Session.deleteMany({ user: user._id });

    expect(await Session.countDocuments({ user: user._id })).toBe(0);
    expect(await Session.countDocuments({ user: other._id })).toBe(1);
  });
});

describe('Admission and staff numbers', () => {
  it('generates a unique admission number for each student', async () => {
    const students = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        User.create({
          firstName: 'Chi',
          lastName: 'Eze',
          email: `student${i}@school.ng`,
          password: 'password123',
          role: 'Student',
        }),
      ),
    );

    const numbers = students.map((s) => s.studentProfile.admissionNumber);
    expect(new Set(numbers).size).toBe(5);
    numbers.forEach((n) => expect(n).toMatch(/^[A-Z]{2}\d{2}\d{4}$/));
  });

  it('does not give a teacher an admission number', async () => {
    const teacher = await makeUser();
    expect(teacher.studentProfile?.admissionNumber).toBeUndefined();
    expect(teacher.teacherProfile?.staffId).toBeDefined();
  });
});

describe('Email uniqueness', () => {
  it('refuses a duplicate email', async () => {
    await makeUser();
    await expect(makeUser()).rejects.toThrow();
  });
});
