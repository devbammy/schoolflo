/**
 * Behaviour ratings and the teacher's comment (form teacher only, locked once
 * published), and the admin's class standings by arm or whole class.
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

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Subject = require('../../src/models/Subject');
const AuditLog = require('../../src/models/AuditLog');
const { Result } = require('../../src/models/Exam');
const { ReportRemark } = require('../../src/models/ReportRemark');
const errorHandler = require('../../src/middleware/errorHandler');
const validate = require('../../src/middleware/validate');
const {
  getClassRemarks,
  saveClassRemarks,
} = require('../../src/controllers/reportRemarkController');
const {
  getRemarksRules,
  saveRemarksRules,
} = require('../../src/validators/reportRemarkValidators');
const { getClassSummary } = require('../../src/controllers/resultController');

const YEAR = '2025/2026';
const TERM = 'First Term';

let actingUser;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/remarks', validate(getRemarksRules), getClassRemarks);
app.put('/remarks', validate(saveRemarksRules), saveClassRemarks);
app.get('/results/class/:classId/summary', getClassSummary);
app.use(errorHandler);

let n = 0;
const makeUser = (role, extra = {}) => {
  n += 1;
  return User.create({
    firstName: role,
    lastName: `U${n}`,
    email: `${role.toLowerCase()}${n}@school.ng`,
    password: 'password123',
    role,
    ...extra,
  });
};

let jss3;
let admin;
let formTeacher;
let subjectTeacher;
let pupilA;
let pupilB;
let maths;

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  jss3 = await Class.create({
    name: 'JSS 3',
    level: 'JSS',
    sections: [{ name: 'A' }, { name: 'B' }],
  });
  admin = await makeUser('Admin');
  formTeacher = await makeUser('Teacher', {
    teacherProfile: { classTeacherOf: jss3._id },
  });
  subjectTeacher = await makeUser('Teacher');
  pupilA = await makeUser('Student', {
    studentProfile: { class: jss3._id, section: 'A' },
  });
  pupilB = await makeUser('Student', {
    studentProfile: { class: jss3._id, section: 'B' },
  });
  maths = await Subject.create({ name: 'Mathematics', code: 'MTH' });
});

const save = (remarks, as = formTeacher) => {
  actingUser = as;
  return request(app)
    .put('/remarks')
    .send({ class: String(jss3._id), term: TERM, academicYear: YEAR, remarks });
};

const read = (query = {}, as = formTeacher) => {
  actingUser = as;
  return request(app)
    .get('/remarks')
    .query({
      class: String(jss3._id),
      term: TERM,
      academicYear: YEAR,
      ...query,
    });
};

describe('behaviour and comments', () => {
  it('are saved by the form teacher and read back with the class', async () => {
    const res = await save([
      {
        student: String(pupilA._id),
        behaviour: { punctuality: 'Very Good', sport: 'Excellent' },
        teacherComment: 'Well behaved. Keep it up',
      },
    ]);
    expect(res.status).toBe(200);

    const list = await read();
    const row = list.body.data.students.find(
      (s) => String(s._id) === String(pupilA._id),
    );
    expect(row.behaviour).toMatchObject({
      punctuality: 'Very Good',
      sport: 'Excellent',
    });
    expect(row.teacherComment).toBe('Well behaved. Keep it up');
    expect(list.body.data.students).toHaveLength(2);
    expect(await AuditLog.countDocuments({ action: 'report.remarks' })).toBe(1);
  });

  it('can be read for one arm', async () => {
    const list = await read({ section: 'b' });

    expect(list.body.data.students.map((s) => String(s._id))).toEqual([
      String(pupilB._id),
    ]);
  });

  it('are refused to a teacher who is not the form teacher', async () => {
    const res = await save(
      [{ student: String(pupilA._id), teacherComment: 'Hello' }],
      subjectTeacher,
    );

    expect(res.status).toBe(403);
    expect(await ReportRemark.countDocuments()).toBe(0);
  });

  it('refuse a student from another class, saving nothing', async () => {
    const other = await Class.create({ name: 'JSS 2', level: 'JSS' });
    const stranger = await makeUser('Student', {
      studentProfile: { class: other._id },
    });

    const res = await save([
      { student: String(pupilA._id), teacherComment: 'Fine' },
      { student: String(stranger._id), teacherComment: 'Not mine' },
    ]);

    expect(res.status).toBe(400);
    expect(await ReportRemark.countDocuments()).toBe(0);
  });

  it('refuse a rating that is not on the card', async () => {
    const res = await save([
      { student: String(pupilA._id), behaviour: { neatness: 'Superb' } },
    ]);

    expect(res.status).toBe(400);
  });

  it('change only what is sent, leaving the other ratings alone', async () => {
    await save([
      {
        student: String(pupilA._id),
        behaviour: { punctuality: 'Good', neatness: 'Fair' },
        teacherComment: 'Keep trying',
      },
    ]);
    await save([
      { student: String(pupilA._id), behaviour: { neatness: 'Very Good' } },
    ]);

    const stored = await ReportRemark.findOne({ student: pupilA._id }).lean();
    expect(stored.behaviour).toEqual({
      punctuality: 'Good',
      neatness: 'Very Good',
    });
    expect(stored.teacherComment).toBe('Keep trying');
  });

  it('lock to teachers once the term is published, but not to an admin', async () => {
    await Result.create({
      student: pupilA._id,
      class: jss3._id,
      subject: maths._id,
      term: TERM,
      academicYear: YEAR,
      scores: { exam: 50 },
      isPublished: true,
    });

    const teacher = await save([
      { student: String(pupilA._id), teacherComment: 'Late change' },
    ]);
    expect(teacher.status).toBe(403);
    expect((await read()).body.data.locked).toBe(true);

    const byAdmin = await save(
      [{ student: String(pupilA._id), teacherComment: 'Corrected' }],
      admin,
    );
    expect(byAdmin.status).toBe(200);
    expect((await read({}, admin)).body.data.locked).toBe(false);
  });
});

describe('the class standings', () => {
  beforeEach(async () => {
    const third = await makeUser('Student', {
      studentProfile: { class: jss3._id, section: 'A' },
    });
    for (const [pupil, exam] of [
      [pupilA, 50],
      [third, 40],
      [pupilB, 60],
    ]) {
      await Result.create({
        student: pupil._id,
        class: jss3._id,
        subject: maths._id,
        term: TERM,
        academicYear: YEAR,
        scores: { exam, ca1: 10, ca2: 10 },
        isPublished: true,
      });
    }
  });

  const summary = (query) => {
    actingUser = admin;
    return request(app)
      .get(`/results/class/${jss3._id}/summary`)
      .query({ term: TERM, academicYear: YEAR, ...query });
  };

  it('ranks the whole class together', async () => {
    const res = await summary({});

    expect(res.body.data).toMatchObject({
      scope: 'class',
      learners: 3,
      highestAverage: 80,
      lowestAverage: 60,
      classAverage: 70,
    });
    expect(res.body.data.students.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('ranks one arm on its own', async () => {
    const res = await summary({ section: 'A' });

    expect(res.body.data).toMatchObject({
      scope: 'arm',
      section: 'A',
      learners: 2,
      highestAverage: 70,
      lowestAverage: 60,
    });
    expect(res.body.data.students[0]).toMatchObject({
      position: 1,
      average: 70,
      grade: 'C4',
    });
  });
});
