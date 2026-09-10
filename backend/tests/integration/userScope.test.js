const request = require('supertest');
const express = require('express');
require('express-async-errors');
const mongoose = require('mongoose');
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

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Subject = require('../../src/models/Subject');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  getUserById,
  getStudentsInClass,
} = require('../../src/controllers/userController');

const YEAR = '2025/2026';

let actingUser;
let admin;
let formTeacher;
let subjectTeacher;
let strangerTeacher;
let ownClass;
let otherClass;
let ownStudent;
let otherStudent;
let parent;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/users/students/class/:classId', getStudentsInClass);
app.get('/users/:id', getUserById);
app.use(errorHandler);

const fetchUser = (id) => request(app).get(`/users/${id}`);
const fetchRoster = (classId) =>
  request(app).get(`/users/students/class/${classId}`);

const makeUser = (role, firstName, extra = {}) =>
  User.create({
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@school.ng`,
    password: 'password123',
    role,
    ...extra,
  });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();

  ownClass = await Class.create({
    name: 'JSS1',
    level: 'JSS',
    academicYear: YEAR,
  });
  otherClass = await Class.create({
    name: 'JSS2',
    level: 'JSS',
    academicYear: YEAR,
  });

  admin = await makeUser('Admin', 'Admin');
  formTeacher = await makeUser('Teacher', 'Form', {
    teacherProfile: { classTeacherOf: ownClass._id },
  });
  strangerTeacher = await makeUser('Teacher', 'Stranger', {
    teacherProfile: {},
  });

  // A subject teacher who form-teaches nothing, but whose subject is offered
  // in JSS1. Grade entry depends on them being able to load that roster.
  const maths = await Subject.create({
    name: 'Mathematics',
    code: 'MTH',
    classes: [ownClass._id],
  });
  subjectTeacher = await makeUser('Teacher', 'Subject', {
    teacherProfile: { subjectsTaught: [maths._id] },
  });

  ownStudent = await makeUser('Student', 'Ada', {
    studentProfile: { class: ownClass._id, profileStatus: 'Active' },
  });
  otherStudent = await makeUser('Student', 'Bola', {
    studentProfile: { class: otherClass._id, profileStatus: 'Active' },
  });
  parent = await makeUser('Parent', 'Ngozi');

  actingUser = admin;
});

describe('GET /users/:id', () => {
  it('lets an admin fetch anyone', async () => {
    actingUser = admin;

    expect((await fetchUser(otherStudent._id)).status).toBe(200);
    expect((await fetchUser(parent._id)).status).toBe(200);
    expect((await fetchUser(formTeacher._id)).status).toBe(200);
  });

  it('lets a teacher fetch a student in a class they form-teach', async () => {
    actingUser = formTeacher;

    const res = await fetchUser(ownStudent._id);

    expect(res.status).toBe(200);
    expect(res.body.data.user.firstName).toBe('Ada');
  });

  it('lets a subject teacher fetch a student in a class their subject is offered in', async () => {
    actingUser = subjectTeacher;

    expect((await fetchUser(ownStudent._id)).status).toBe(200);
  });

  it('refuses a teacher a student outside their classes', async () => {
    actingUser = formTeacher;

    const res = await fetchUser(otherStudent._id);

    expect(res.status).toBe(403);
  });

  it('refuses a teacher another member of staff', async () => {
    // The route was open to any Teacher for any id, so every teacher could
    // read every colleague's and every admin's full profile.
    actingUser = formTeacher;

    expect((await fetchUser(admin._id)).status).toBe(403);
    expect((await fetchUser(strangerTeacher._id)).status).toBe(403);
  });

  it('refuses a teacher a parent record', async () => {
    actingUser = formTeacher;

    expect((await fetchUser(parent._id)).status).toBe(403);
  });

  it('still lets a teacher fetch their own record', async () => {
    actingUser = formTeacher;

    expect((await fetchUser(formTeacher._id)).status).toBe(200);
  });

  it('refuses a teacher with no assignments at all', async () => {
    actingUser = strangerTeacher;

    expect((await fetchUser(ownStudent._id)).status).toBe(403);
  });

  it('404s on a missing user rather than leaking existence through a 403', async () => {
    actingUser = admin;

    const res = await fetchUser(new mongoose.Types.ObjectId());

    expect(res.status).toBe(404);
  });
});

describe('GET /users/students/class/:classId', () => {
  it('lets an admin list any class', async () => {
    actingUser = admin;

    const res = await fetchRoster(otherClass._id);

    expect(res.status).toBe(200);
    expect(res.body.data.count).toBe(1);
  });

  it('lets a form teacher list their own class', async () => {
    actingUser = formTeacher;

    const res = await fetchRoster(ownClass._id);

    expect(res.status).toBe(200);
    expect(res.body.data.students[0].firstName).toBe('Ada');
  });

  it('lets a subject teacher list a class their subject is offered in', async () => {
    // Without this, scoping the roster would break grade entry for every
    // teacher who is not also a form teacher.
    actingUser = subjectTeacher;

    expect((await fetchRoster(ownClass._id)).status).toBe(200);
  });

  it('refuses a teacher a class they have nothing to do with', async () => {
    actingUser = formTeacher;

    const res = await fetchRoster(otherClass._id);

    expect(res.status).toBe(403);
  });

  it('refuses a subject teacher a class their subject is not offered in', async () => {
    actingUser = subjectTeacher;

    expect((await fetchRoster(otherClass._id)).status).toBe(403);
  });
});
