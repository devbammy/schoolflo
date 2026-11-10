/**
 * The Administrators page: listing, adding and deactivating admins.
 *
 * The page adds no routes of its own. It uses POST /auth/register with
 * role Admin, GET /users?role=Admin and PATCH /users/:id/toggle-status, so
 * these tests drive the real routers with real tokens: what matters is that
 * only an admin can make another admin, and that the school can never lock
 * itself out.
 */

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

process.env.JWT_SECRET = 'test-secret-at-least-32-characters-long';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-at-least-32-chars';

const { enqueueEmail } = require('../../src/services/jobQueue');
const User = require('../../src/models/User');
const errorHandler = require('../../src/middleware/errorHandler');
const authRoutes = require('../../src/routes/auth');
const userRoutes = require('../../src/routes/users');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use('/users', userRoutes);
app.use(errorHandler);

const bearer = (user) => `Bearer ${user.generateAccessToken()}`;

const newAdmin = {
  firstName: 'Amaka',
  lastName: 'Okoro',
  email: 'amaka.okoro@school.ng',
  password: 'starting-pass-1',
  role: 'Admin',
};

let head;

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  enqueueEmail.mockClear();
  head = await User.create({
    firstName: 'Head',
    lastName: 'Admin',
    email: 'head@school.ng',
    password: 'head-password-1',
    role: 'Admin',
  });
});

describe('adding an administrator', () => {
  it('creates an admin who can sign in, and emails them', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', bearer(head))
      .send(newAdmin);

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('Admin');
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(enqueueEmail.mock.calls[0][0].to).toBe('amaka.okoro@school.ng');

    const signIn = await request(app).post('/auth/login').send({
      identifier: 'amaka.okoro@school.ng',
      password: 'starting-pass-1',
    });
    expect(signIn.status).toBe(200);
    expect(signIn.body.data.user.role).toBe('Admin');
  });

  it('is refused to anyone who is not an admin', async () => {
    const teacher = await User.create({
      firstName: 'Ngozi',
      lastName: 'Eze',
      email: 'ngozi@school.ng',
      password: 'teacher-pass-1',
      role: 'Teacher',
    });

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', bearer(teacher))
      .send(newAdmin);

    expect(res.status).toBe(403);
    expect(await User.countDocuments({ role: 'Admin' })).toBe(1);
  });

  it('refuses an address that already has an account', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', bearer(head))
      .send({ ...newAdmin, email: 'head@school.ng' });

    expect(res.status).toBe(400);
  });

  it('requires an email, unlike a student', async () => {
    const { email, ...noEmail } = newAdmin;

    const res = await request(app)
      .post('/auth/register')
      .set('Authorization', bearer(head))
      .send(noEmail);

    expect(res.status).toBe(400);
  });
});

describe('the list of administrators', () => {
  it('contains admins only', async () => {
    await User.create({ ...newAdmin });
    await User.create({
      ...newAdmin,
      email: 'teacher@school.ng',
      role: 'Teacher',
    });

    const res = await request(app)
      .get('/users')
      .query({ role: 'Admin' })
      .set('Authorization', bearer(head));

    expect(res.status).toBe(200);
    expect(res.body.data.map((u) => u.email).sort()).toEqual([
      'amaka.okoro@school.ng',
      'head@school.ng',
    ]);
  });
});

describe('deactivating an administrator', () => {
  it('works on another admin and signs them out', async () => {
    const other = await User.create({ ...newAdmin });

    const res = await request(app)
      .patch(`/users/${other._id}/toggle-status`)
      .set('Authorization', bearer(head));

    expect(res.status).toBe(200);
    expect((await User.findById(other._id)).isActive).toBe(false);

    const signIn = await request(app).post('/auth/login').send({
      identifier: 'amaka.okoro@school.ng',
      password: 'starting-pass-1',
    });
    expect(signIn.status).toBe(401);
  });

  it('never lets an admin deactivate themselves', async () => {
    await User.create({ ...newAdmin });

    const res = await request(app)
      .patch(`/users/${head._id}/toggle-status`)
      .set('Authorization', bearer(head));

    expect(res.status).toBe(400);
    expect((await User.findById(head._id)).isActive).toBe(true);
  });
});
