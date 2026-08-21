const express = require('express');
const request = require('supertest');
require('express-async-errors');

const db = require('../setup/db');

jest.mock('../../src/services/auditService', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  diff: jest.fn(() => ({})),
}));

const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Attendance = require('../../src/models/Attendance');
const AcademicCalendar = require('../../src/models/AcademicCalendar');
const {
  markAttendance,
  getClassRegister,
  getClassReport,
  getMyClasses,
} = require('../../src/controllers/attendanceController');
const validate = require('../../src/middleware/validate');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  markAttendanceRules,
} = require('../../src/validators/academicValidators');

let actingUser;
let ownClass;
let otherClass;
let admin;
let teacher;
let students;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.post('/attendance/mark', validate(markAttendanceRules), markAttendance);
app.get('/attendance/my-classes', getMyClasses);
app.get('/attendance/class/:classId/report', getClassReport);
app.get('/attendance/class/:classId', getClassRegister);
app.use(errorHandler);

const today = () => new Date().toISOString().slice(0, 10);

const makeUser = (role, firstName, extra = {}) =>
  User.create({
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@school.com`,
    password: 'password123',
    role,
    ...extra,
  });

const register = (overrides = {}) =>
  request(app)
    .post('/attendance/mark')
    .send({
      classId: String(ownClass._id),
      date: today(),
      records: students.map((s) => ({
        student: String(s._id),
        status: 'Present',
      })),
      ...overrides,
    });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();

  admin = await makeUser('Admin', 'Ada');

  ownClass = await Class.create({
    name: 'JSS1',
    level: 'JSS',
    academicYear: '2025/2026',
  });
  otherClass = await Class.create({
    name: 'SS2',
    level: 'SS',
    academicYear: '2025/2026',
  });

  teacher = await makeUser('Teacher', 'Bola', {
    teacherProfile: { classTeacherOf: ownClass._id },
  });

  students = await Promise.all([
    makeUser('Student', 'Chidi', {
      studentProfile: { class: ownClass._id },
    }),
    makeUser('Student', 'Dami', {
      studentProfile: { class: ownClass._id },
    }),
  ]);

  actingUser = teacher;
});

describe('class scoping', () => {
  it('lists only the classes a teacher is responsible for', async () => {
    const res = await request(app).get('/attendance/my-classes');

    expect(res.status).toBe(200);
    expect(res.body.data.classes).toHaveLength(1);
    expect(res.body.data.classes[0].name).toBe('JSS1');
  });

  it('gives an admin every class', async () => {
    actingUser = admin;
    const res = await request(app).get('/attendance/my-classes');

    expect(res.body.data.classes).toHaveLength(2);
  });

  it('refuses a register for a class the teacher does not teach', async () => {
    const res = await register({ classId: String(otherClass._id) });

    expect(res.status).toBe(403);
  });

  it('refuses to read a register for a class the teacher does not teach', async () => {
    const res = await request(app).get(`/attendance/class/${otherClass._id}`);

    expect(res.status).toBe(403);
  });

  it('counts a section class teacher as responsible for the class', async () => {
    const sectionTeacher = await makeUser('Teacher', 'Emeka');
    otherClass.sections = [{ name: 'A', classTeacher: sectionTeacher._id }];
    await otherClass.save();

    actingUser = sectionTeacher;
    const res = await request(app).get('/attendance/my-classes');

    expect(res.body.data.classes.map((c) => c.name)).toEqual(['SS2']);
  });
});

describe('marking a register', () => {
  it('stamps the term and session from the active calendar', async () => {
    const now = new Date();

    await AcademicCalendar.create({
      academicYear: '2025/2026',
      sessionStartDate: new Date(now.getFullYear(), 0, 1),
      sessionEndDate: new Date(now.getFullYear() + 1, 0, 1),
      isActive: true,
      createdBy: admin._id,
      terms: [
        {
          name: 'Second Term',
          startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
          endDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
        },
      ],
    });

    const res = await register();

    expect(res.status).toBe(200);
    expect(res.body.data.term).toBe('Second Term');
    expect(res.body.data.academicYear).toBe('2025/2026');

    const saved = await Attendance.findOne({ student: students[0]._id });
    expect(saved.term).toBe('Second Term');
  });

  it('stores one record per student per day, however often it is re-marked', async () => {
    await register();
    await register({
      records: students.map((s) => ({
        student: String(s._id),
        status: 'Absent',
      })),
    });

    const saved = await Attendance.find({ class: ownClass._id });

    expect(saved).toHaveLength(students.length);
    expect(saved.every((r) => r.status === 'Absent')).toBe(true);
  });

  it('rejects a student who is not in the class', async () => {
    const outsider = await makeUser('Student', 'Femi', {
      studentProfile: { class: otherClass._id },
    });

    const res = await register({
      records: [{ student: String(outsider._id), status: 'Present' }],
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not in the selected class/i);
  });

  it('refuses a register dated in the future', async () => {
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const res = await register({ date: future.toISOString().slice(0, 10) });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/future/i);
  });
});

describe('reading a register back', () => {
  it('returns what was already marked, not a blank sheet', async () => {
    await register({
      records: [
        { student: String(students[0]._id), status: 'Absent' },
        { student: String(students[1]._id), status: 'Late' },
      ],
    });

    const res = await request(app)
      .get(`/attendance/class/${ownClass._id}`)
      .query({ date: today() });

    expect(res.status).toBe(200);
    expect(res.body.data.students).toHaveLength(2);
    expect(res.body.data.isMarked).toBe(true);

    const byStudent = Object.fromEntries(
      res.body.data.records.map((r) => [String(r.student), r.status]),
    );
    expect(byStudent[String(students[0]._id)]).toBe('Absent');
    expect(byStudent[String(students[1]._id)]).toBe('Late');
  });

  it('reports an unmarked day as unmarked', async () => {
    const res = await request(app)
      .get(`/attendance/class/${ownClass._id}`)
      .query({ date: today() });

    expect(res.body.data.isMarked).toBe(false);
    expect(res.body.data.records).toHaveLength(0);
  });
});

describe('the class report', () => {
  it('includes a student who has never been marked', async () => {
    await register({
      records: [{ student: String(students[0]._id), status: 'Present' }],
    });

    const res = await request(app).get(
      `/attendance/class/${ownClass._id}/report`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.report).toHaveLength(2);

    const never = res.body.data.report.find(
      (row) => String(row.student._id) === String(students[1]._id),
    );
    expect(never.total).toBe(0);
    expect(never.percentage).toBe(0);
  });

  it('counts a late arrival towards attendance', async () => {
    await register({
      records: [{ student: String(students[0]._id), status: 'Late' }],
    });

    const res = await request(app).get(
      `/attendance/class/${ownClass._id}/report`,
    );

    const row = res.body.data.report.find(
      (r) => String(r.student._id) === String(students[0]._id),
    );

    expect(row.Late).toBe(1);
    expect(row.percentage).toBe(100);
    expect(res.body.data.daysMarked).toBe(1);
  });
});
