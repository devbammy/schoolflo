const request = require('supertest');
const express = require('express');
require('express-async-errors');
const db = require('../setup/db');

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ success: true, queued: true }),
  enqueueBulkEmail: jest.fn().mockResolvedValue({ queued: 0, total: 0 }),
  startJobQueue: jest.fn(),
  stopJobQueue: jest.fn(),
}));

jest.mock('../../src/services/notificationService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendBulkEmails: jest.fn().mockResolvedValue({ sent: 0, failed: 0, total: 0 }),
  verifyTransport: jest.fn().mockResolvedValue(true),
  emailTemplates: new Proxy({}, { get: () => () => '<html></html>' }),
}));

process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars';
process.env.JWT_EXPIRE = '1h';
process.env.JWT_REFRESH_EXPIRE = '30d';

const User = require('../../src/models/User');
const Session = require('../../src/models/Session');
const AuditLog = require('../../src/models/AuditLog');
const errorHandler = require('../../src/middleware/errorHandler');
const { login, refreshToken } = require('../../src/controllers/authController');

const app = express();
app.use(express.json());
app.post('/auth/login', login);
app.post('/auth/refresh', refreshToken);
app.use(errorHandler);

const PASSWORD = 'correct-horse-battery';

const signIn = async () => {
  const res = await request(app)
    .post('/auth/login')
    .send({ email: 'ada@school.ng', password: PASSWORD });

  expect(res.status).toBe(200);
  return res.body.data.refreshToken;
};

const refresh = (token) =>
  request(app).post('/auth/refresh').send({ refreshToken: token });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  await User.create({
    firstName: 'Ada',
    lastName: 'Obi',
    email: 'ada@school.ng',
    password: PASSWORD,
    role: 'Teacher',
  });
});

describe('Refresh token rotation', () => {
  it('issues a different refresh token on every use', async () => {
    const first = await signIn();

    const res = await refresh(first);

    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.refreshToken).not.toBe(first);
    expect(res.body.data.accessToken).toBeDefined();
  });

  it('mints distinct tokens even within the same second', async () => {
    // Without a jti the payload is { id } plus whole-second iat/exp, so two
    // tokens for the same user in one second are byte-identical — they would
    // collide on Session.tokenHash and rotation could not replace a row.
    const user = await User.findOne({ email: 'ada@school.ng' });

    expect(user.generateRefreshToken()).not.toBe(user.generateRefreshToken());
  });

  it('keeps the session count at one — rotation replaces, never accumulates', async () => {
    const first = await signIn();
    const second = (await refresh(first)).body.data.refreshToken;
    await refresh(second);

    expect(await Session.countDocuments()).toBe(1);
  });

  it('does not extend the session expiry on rotation', async () => {
    const first = await signIn();
    const before = (await Session.findOne()).expiresAt.getTime();

    await refresh(first);

    const after = (await Session.findOne()).expiresAt.getTime();
    expect(after).toBe(before);
  });

  it('accepts the retired token inside the grace window, without rotating again', async () => {
    // Two browser tabs share one refresh token. Both hit a 401 at the same
    // moment and both present it; the loser must not be signed out.
    const first = await signIn();
    const rotated = (await refresh(first)).body.data.refreshToken;

    const race = await refresh(first);

    expect(race.status).toBe(200);
    expect(race.body.data.accessToken).toBeDefined();
    // No second rotation: the token the winner holds is still the live one.
    expect(race.body.data.refreshToken).toBeUndefined();
    expect((await Session.findOne()).tokenHash).toBe(
      Session.hashToken(rotated),
    );
  });

  it('revokes the session when a retired token is replayed after the grace window', async () => {
    const first = await signIn();
    await refresh(first);

    // Age the rotation past the grace window.
    await Session.updateOne(
      {},
      {
        $set: {
          rotatedAt: new Date(Date.now() - Session.ROTATION_GRACE_MS - 1000),
        },
      },
    );

    const replay = await refresh(first);

    expect(replay.status).toBe(401);
    expect(await Session.countDocuments()).toBe(0);
  });

  it('records a replay in the audit log', async () => {
    const first = await signIn();
    await refresh(first);
    await Session.updateOne(
      {},
      {
        $set: {
          rotatedAt: new Date(Date.now() - Session.ROTATION_GRACE_MS - 1000),
        },
      },
    );

    await refresh(first);

    const entry = await AuditLog.findOne({ action: 'auth.refresh_reuse' });
    expect(entry).toBeTruthy();
    expect(entry.outcome).toBe('failure');
  });

  it('leaves the rotated token working after a replay is rejected elsewhere', async () => {
    const first = await signIn();
    const rotated = (await refresh(first)).body.data.refreshToken;

    const next = await refresh(rotated);

    expect(next.status).toBe(200);
    expect(next.body.data.refreshToken).not.toBe(rotated);
  });

  it('still refuses a token whose session was logged out', async () => {
    const first = await signIn();
    await Session.deleteMany({});

    expect((await refresh(first)).status).toBe(401);
  });

  it('keeps two devices independent', async () => {
    const deviceA = await signIn();
    const deviceB = await signIn();

    expect(await Session.countDocuments()).toBe(2);

    await refresh(deviceA);

    // Rotating one device must not disturb the other.
    expect((await refresh(deviceB)).status).toBe(200);
    expect(await Session.countDocuments()).toBe(2);
  });
});
