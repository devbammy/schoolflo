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
const errorHandler = require('../../src/middleware/errorHandler');
const { updateUser } = require('../../src/controllers/userController');
const { updateParent } = require('../../src/controllers/parentController');

let actingUser;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.put('/users/:id', updateUser);
app.put('/parents/:id', updateParent);
app.use(errorHandler);

let n = 0;
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

let jss1;
let ss1;

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  actingUser = await makeUser('Admin');
  jss1 = await Class.create({ name: 'JSS 1', level: 'JSS' });
  ss1 = await Class.create({ name: 'SS 1 Science', level: 'SS' });
});

describe('editing a teacher', () => {
  // The form exactly as TeachersPage sends it for a teacher with no form class.
  const teacherForm = (subjects = []) => ({
    firstName: 'Ngozi',
    lastName: 'Eze',
    phone: '08030000001',
    teacherProfile: {
      staffId: 'NE260001',
      qualification: 'B.Ed',
      specialization: '',
      experience: '',
      designation: '',
      classTeacherOf: '',
      subjectsTaught: subjects,
    },
  });

  it('saves with no form class chosen', async () => {
    const teacher = await makeUser('Teacher');

    const res = await request(app)
      .put(`/users/${teacher._id}`)
      .send(teacherForm());

    expect(res.status).toBe(200);
    expect(res.body.data.user.firstName).toBe('Ngozi');
  });

  it('clears a form class that is emptied', async () => {
    const teacher = await makeUser('Teacher', {
      teacherProfile: { classTeacherOf: jss1._id },
    });

    await request(app).put(`/users/${teacher._id}`).send(teacherForm());

    const stored = await User.findById(teacher._id);
    expect(stored.teacherProfile.classTeacherOf).toBeUndefined();
  });

  it('keeps the staff ID and join date the form does not change', async () => {
    const teacher = await makeUser('Teacher');
    const { staffId, joinDate } = teacher.teacherProfile;

    await request(app).put(`/users/${teacher._id}`).send(teacherForm());

    const stored = await User.findById(teacher._id);
    expect(stored.teacherProfile.staffId).toBe(staffId);
    expect(stored.teacherProfile.joinDate).toEqual(joinDate);
  });

  it('saves the subjects taught', async () => {
    const teacher = await makeUser('Teacher');
    const maths = await Subject.create({ name: 'Mathematics', code: 'MTH' });

    await request(app)
      .put(`/users/${teacher._id}`)
      .send(teacherForm([String(maths._id), '']));

    const stored = await User.findById(teacher._id);
    expect(stored.teacherProfile.subjectsTaught.map(String)).toEqual([
      String(maths._id),
    ]);
  });
});

describe('editing a student', () => {
  // The form exactly as StudentsPage sends it, which has no parent or history.
  const studentForm = (extra = {}) => ({
    firstName: 'Ada',
    lastName: 'Obi',
    phone: '',
    studentProfile: {
      admissionNumber: 'AO260002',
      gender: '',
      class: String(ss1._id),
      section: 'B',
      dateOfBirth: '',
      address: '',
      bloodGroup: '',
      medicalNotes: '',
      ...extra,
    },
  });

  it('keeps the linked parent, class history and status', async () => {
    const parent = await makeUser('Parent');
    const student = await makeUser('Student', {
      studentProfile: {
        class: jss1._id,
        parentId: parent._id,
        profileStatus: 'Active',
        enrolments: [{ class: jss1._id, academicYear: '2024/2025' }],
      },
    });
    const { admissionNumber } = student.studentProfile;

    const res = await request(app)
      .put(`/users/${student._id}`)
      .send(studentForm());

    expect(res.status).toBe(200);
    const stored = await User.findById(student._id);
    expect(String(stored.studentProfile.parentId)).toBe(String(parent._id));
    expect(stored.studentProfile.enrolments).toHaveLength(1);
    expect(stored.studentProfile.profileStatus).toBe('Active');
    expect(stored.studentProfile.admissionNumber).toBe(admissionNumber);
    expect(String(stored.studentProfile.class)).toBe(String(ss1._id));
    expect(stored.studentProfile.section).toBe('B');
  });

  it('accepts an empty gender and date of birth', async () => {
    const student = await makeUser('Student', {
      studentProfile: { gender: 'Female', dateOfBirth: new Date('2012-01-01') },
    });

    const res = await request(app)
      .put(`/users/${student._id}`)
      .send(studentForm());

    expect(res.status).toBe(200);
    const stored = await User.findById(student._id);
    expect(stored.studentProfile.gender).toBeUndefined();
    expect(stored.studentProfile.dateOfBirth).toBeUndefined();
  });

  it('ignores fields the form does not own', async () => {
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });

    await request(app)
      .put(`/users/${student._id}`)
      .send(
        studentForm({
          admissionNumber: 'HACKED1',
          enrolments: [{ class: ss1._id, academicYear: '2020/2021' }],
        }),
      );

    const stored = await User.findById(student._id);
    expect(stored.studentProfile.admissionNumber).not.toBe('HACKED1');
    expect(stored.studentProfile.enrolments).toHaveLength(0);
  });

  it('never clears a required name', async () => {
    const student = await makeUser('Student');

    const res = await request(app)
      .put(`/users/${student._id}`)
      .send({ firstName: '' });

    expect(res.status).toBe(200);
    expect((await User.findById(student._id)).firstName).toBe('Student');
  });
});

describe('editing a parent', () => {
  it('keeps their linked children', async () => {
    const child = await makeUser('Student');
    const parent = await makeUser('Parent', {
      parentProfile: { relationship: 'Mother', children: [child._id] },
    });

    // The form exactly as ParentsPage sends it.
    const res = await request(app)
      .put(`/parents/${parent._id}`)
      .send({
        firstName: 'Chinwe',
        lastName: 'Obi',
        phone: '08030000009',
        role: 'Parent',
        parentProfile: { occupation: 'Trader', relationship: 'Mother' },
      });

    expect(res.status).toBe(200);
    const stored = await User.findById(parent._id);
    expect(stored.parentProfile.children.map(String)).toEqual([
      String(child._id),
    ]);
    expect(stored.parentProfile.occupation).toBe('Trader');
    expect(stored.phone).toBe('08030000009');
  });
});
