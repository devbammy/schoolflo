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

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Subject = require('../../src/models/Subject');
const { Result } = require('../../src/models/Exam');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  upsertResult,
  bulkUpsertResults,
  getClassResults,
} = require('../../src/controllers/resultController');

const YEAR = '2025/2026';
const TERM = 'First Term';

let actingUser;
let n = 0;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.post('/results', upsertResult);
app.post('/results/bulk', bulkUpsertResults);
app.get('/results/class/:classId', getClassResults);
app.use(errorHandler);

const makeUser = (role, extra = {}) => {
  n += 1;
  return User.create({
    firstName: role,
    lastName: `T${n}`,
    email: `${role.toLowerCase()}${n}@school.ng`,
    password: 'password123',
    role,
    ...extra,
  });
};

let offered;
let notOffered;
let maths;
let pupil;
let pupilElsewhere;

const scoreFor = (student, classDoc = offered, subject = maths) =>
  request(app)
    .post('/results')
    .send({
      student: student._id,
      class: classDoc._id,
      subject: subject._id,
      term: TERM,
      academicYear: YEAR,
      scores: { exam: 40 },
    });

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  offered = await Class.create({ name: 'JSS1', level: 'JSS' });
  notOffered = await Class.create({ name: 'JSS2', level: 'JSS' });
  maths = await Subject.create({
    name: 'Maths',
    code: 'MTH',
    classes: [offered._id],
  });
  pupil = await makeUser('Student', { studentProfile: { class: offered._id } });
  pupilElsewhere = await makeUser('Student', {
    studentProfile: { class: notOffered._id },
  });
});

describe('who may enter a score', () => {
  it('lets a subject teacher score a class the subject is offered in', async () => {
    actingUser = await makeUser('Teacher', {
      teacherProfile: { subjectsTaught: [maths._id] },
    });

    expect((await scoreFor(pupil)).status).toBe(200);
  });

  it('refuses a class their subject is not offered in', async () => {
    actingUser = await makeUser('Teacher', {
      teacherProfile: { subjectsTaught: [maths._id] },
    });

    const res = await scoreFor(pupilElsewhere, notOffered);

    expect(res.status).toBe(403);
    expect(await Result.countDocuments()).toBe(0);
  });

  it('accepts a teacher assigned from the subject’s side only', async () => {
    actingUser = await makeUser('Teacher');
    await Subject.updateOne({ _id: maths._id }, { teachers: [actingUser._id] });

    expect((await scoreFor(pupil)).status).toBe(200);
  });

  it('accepts the class teacher of a section', async () => {
    actingUser = await makeUser('Teacher');
    await Class.updateOne(
      { _id: offered._id },
      { sections: [{ name: 'A', classTeacher: actingUser._id }] },
    );

    expect((await scoreFor(pupil)).status).toBe(200);
  });

  it('applies the same rule on the bulk route', async () => {
    actingUser = await makeUser('Teacher', {
      teacherProfile: { subjectsTaught: [maths._id] },
    });

    const res = await request(app)
      .post('/results/bulk')
      .send({
        class: notOffered._id,
        subject: maths._id,
        term: TERM,
        academicYear: YEAR,
        results: [{ student: pupilElsewhere._id, scores: { exam: 40 } }],
      });

    expect(res.status).toBe(403);
  });
});

describe('a score must belong to the class it is filed under', () => {
  beforeEach(async () => {
    actingUser = await makeUser('Admin');
  });

  it('refuses a student who is not in the class', async () => {
    const res = await scoreFor(pupilElsewhere, offered);

    expect(res.status).toBe(400);
    expect(await Result.countDocuments()).toBe(0);
  });

  it('rejects the whole bulk batch over one foreign student', async () => {
    const res = await request(app)
      .post('/results/bulk')
      .send({
        class: offered._id,
        subject: maths._id,
        term: TERM,
        academicYear: YEAR,
        results: [
          { student: pupil._id, scores: { exam: 40 } },
          { student: pupilElsewhere._id, scores: { exam: 40 } },
        ],
      });

    expect(res.status).toBe(400);
    expect(await Result.countDocuments()).toBe(0);
  });

  it('still lets an admin correct a mark after the student has moved on', async () => {
    await scoreFor(pupil);
    await User.updateOne(
      { _id: pupil._id },
      { 'studentProfile.class': notOffered._id },
    );

    const res = await scoreFor(pupil);

    expect(res.status).toBe(200);
  });

  it('accepts a past session recorded in the student’s enrolments', async () => {
    await User.updateOne(
      { _id: pupilElsewhere._id },
      {
        'studentProfile.enrolments': [
          { class: offered._id, academicYear: YEAR },
        ],
      },
    );

    expect((await scoreFor(pupilElsewhere, offered)).status).toBe(200);
  });
});

describe('who may read a class’s results', () => {
  it('shows a section’s class teacher every subject', async () => {
    const english = await Subject.create({
      name: 'English',
      code: 'ENG',
      classes: [offered._id],
    });
    await Result.create([
      {
        student: pupil._id,
        class: offered._id,
        subject: maths._id,
        term: TERM,
        academicYear: YEAR,
      },
      {
        student: pupil._id,
        class: offered._id,
        subject: english._id,
        term: TERM,
        academicYear: YEAR,
      },
    ]);
    actingUser = await makeUser('Teacher');
    await Class.updateOne(
      { _id: offered._id },
      { sections: [{ name: 'A', classTeacher: actingUser._id }] },
    );

    const res = await request(app).get(`/results/class/${offered._id}`);

    expect(res.body.data.count).toBe(2);
  });

  it('refuses a subject teacher a class their subject is not in', async () => {
    actingUser = await makeUser('Teacher', {
      teacherProfile: { subjectsTaught: [maths._id] },
    });

    const res = await request(app).get(`/results/class/${notOffered._id}`);

    expect(res.status).toBe(403);
  });
});
