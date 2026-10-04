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
const Certificate = require('../../src/models/Certificate');
const { Result } = require('../../src/models/Exam');
const { Fees, Payment } = require('../../src/models/Fees');
const { Book, BorrowRecord } = require('../../src/models/Library');
const { Assignment } = require('../../src/models/Assignment');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  deleteUser,
  toggleUserStatus,
} = require('../../src/controllers/userController');
const {
  getAssignments,
  getAssignmentById,
} = require('../../src/controllers/assignmentController');
const {
  createSubmission,
} = require('../../src/controllers/submissionController');
const { upsertResult } = require('../../src/controllers/resultController');
const { borrowBook } = require('../../src/controllers/libraryController');
const {
  recordManualPayment,
  updateFeeStructure,
} = require('../../src/controllers/paymentController');
const {
  downloadCertificate,
} = require('../../src/controllers/certificateController');

const YEAR = '2025/2026';

let actingUser;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.delete('/users/:id', deleteUser);
app.patch('/users/:id/toggle-status', toggleUserStatus);
app.get('/assignments', getAssignments);
app.get('/assignments/:id', getAssignmentById);
app.post('/submissions', createSubmission);
app.post('/results', upsertResult);
app.post('/library/borrow', borrowBook);
app.post('/payments/manual', recordManualPayment);
app.put('/fees/:id', updateFeeStructure);
app.get('/certificates/:id/download', downloadCertificate);
app.use(errorHandler);

let counter = 0;
const makeUser = (role, extra = {}) => {
  counter += 1;
  return User.create({
    firstName: `${role}${counter}`,
    lastName: 'Test',
    email: `${role.toLowerCase()}${counter}@school.ng`,
    password: 'password123',
    role,
    ...extra,
  });
};

const as = (user) => {
  actingUser = user;
};

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
});

describe('deleting and deactivating users', () => {
  it('refuses to deactivate yourself', async () => {
    const admin = await makeUser('Admin');
    await makeUser('Admin'); // another admin exists, so this is not the last-admin rule
    as(admin);

    const res = await request(app).patch(`/users/${admin._id}/toggle-status`);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/own account/);
  });

  it('refuses to deactivate or delete the last active admin', async () => {
    const onlyAdmin = await makeUser('Admin');
    // Someone else, signed in as an admin, but not one in the database.
    as({ _id: new mongoose.Types.ObjectId(), role: 'Admin' });

    const toggle = await request(app).patch(
      `/users/${onlyAdmin._id}/toggle-status`,
    );
    const remove = await request(app).delete(`/users/${onlyAdmin._id}`);

    expect(toggle.status).toBe(400);
    expect(remove.status).toBe(400);
    expect((await User.findById(onlyAdmin._id)).isActive).toBe(true);
  });

  it('allows deactivating an admin when another remains', async () => {
    const a = await makeUser('Admin');
    const b = await makeUser('Admin');
    as(a);

    const res = await request(app).patch(`/users/${b._id}/toggle-status`);

    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(false);
  });

  it('refuses to delete a student who has payments, and keeps them', async () => {
    const admin = await makeUser('Admin');
    const student = await makeUser('Student');
    await Payment.create({
      student: student._id,
      feeStructure: new mongoose.Types.ObjectId(),
      term: 'First Term',
      academicYear: YEAR,
      amountPaid: 5000,
      amountDue: 5000,
    });
    as(admin);

    const res = await request(app).delete(`/users/${student._id}`);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/payments/);
    expect(await User.findById(student._id)).not.toBeNull();
  });

  it('deletes a student with no records and unlinks them from their parent', async () => {
    const admin = await makeUser('Admin');
    const student = await makeUser('Student');
    const parent = await makeUser('Parent', {
      parentProfile: { children: [student._id] },
    });
    as(admin);

    const res = await request(app).delete(`/users/${student._id}`);

    expect(res.status).toBe(200);
    expect(await User.findById(student._id)).toBeNull();
    const after = await User.findById(parent._id);
    expect(after.parentProfile.children).toHaveLength(0);
  });
});

describe('assignments are scoped to their audience', () => {
  let ownClass;
  let otherClass;
  let student;
  let outsider;
  let parent;
  let published;
  let draft;
  let elsewhere;

  beforeEach(async () => {
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
    const subject = await Subject.create({ name: 'Maths', code: 'MTH' });
    const teacher = await makeUser('Teacher');
    student = await makeUser('Student', {
      studentProfile: { class: ownClass._id },
    });
    outsider = await makeUser('Student', {
      studentProfile: { class: otherClass._id },
    });
    parent = await makeUser('Parent', {
      parentProfile: { children: [student._id] },
    });

    const base = {
      description: 'd',
      subject: subject._id,
      teacher: teacher._id,
      term: 'First Term',
      academicYear: YEAR,
      dueDate: new Date(Date.now() + 7 * 864e5),
      totalMarks: 20,
    };
    published = await Assignment.create({
      ...base,
      title: 'Live',
      class: ownClass._id,
      isPublished: true,
    });
    draft = await Assignment.create({
      ...base,
      title: 'Draft',
      class: ownClass._id,
      isPublished: false,
    });
    elsewhere = await Assignment.create({
      ...base,
      title: 'Other class',
      class: otherClass._id,
      isPublished: true,
    });
  });

  it('shows a student only published work for their own class', async () => {
    as(student);
    const res = await request(app).get('/assignments');

    expect(res.status).toBe(200);
    expect(res.body.data.assignments.map((a) => a.title)).toEqual(['Live']);
  });

  it('does not let a student widen the list with a query string', async () => {
    as(student);
    const res = await request(app).get(
      `/assignments?classId=${otherClass._id}&status=draft`,
    );

    expect(res.body.data.assignments.map((a) => a.title)).toEqual(['Live']);
  });

  it('hides a draft and another class assignment by id', async () => {
    as(student);

    expect((await request(app).get(`/assignments/${draft._id}`)).status).toBe(
      404,
    );
    expect(
      (await request(app).get(`/assignments/${elsewhere._id}`)).status,
    ).toBe(404);
    expect(
      (await request(app).get(`/assignments/${published._id}`)).status,
    ).toBe(200);
  });

  it('shows a parent only their child published work', async () => {
    as(parent);
    const res = await request(app).get('/assignments');

    expect(res.body.data.assignments.map((a) => a.title)).toEqual(['Live']);
  });

  it('refuses a submission to another class assignment', async () => {
    as(outsider);
    const res = await request(app)
      .post('/submissions')
      .send({ assignmentId: String(published._id) });

    expect(res.status).toBe(403);
  });
});

describe('published results are locked to teachers', () => {
  it('lets a teacher write, refuses once published, and lets an admin correct', async () => {
    const cls = await Class.create({
      name: 'JSS1',
      level: 'JSS',
      academicYear: YEAR,
    });
    const subject = await Subject.create({ name: 'Maths', code: 'MTH' });
    const teacher = await makeUser('Teacher', {
      teacherProfile: { subjectsTaught: [subject._id] },
    });
    const admin = await makeUser('Admin');
    const student = await makeUser('Student', {
      studentProfile: { class: cls._id },
    });

    const body = (exam) => ({
      student: String(student._id),
      class: String(cls._id),
      subject: String(subject._id),
      term: 'First Term',
      academicYear: YEAR,
      scores: { ca1: 8, ca2: 8, classWork: 8, project: 8, exam },
    });

    as(teacher);
    expect((await request(app).post('/results').send(body(40))).status).toBe(
      200,
    );

    await Result.updateMany({}, { $set: { isPublished: true } });

    const locked = await request(app).post('/results').send(body(50));
    expect(locked.status).toBe(403);
    expect(locked.body.message).toMatch(/locked/);
    expect((await Result.findOne()).scores.exam).toBe(40);

    as(admin);
    const corrected = await request(app).post('/results').send(body(50));
    expect(corrected.status).toBe(200);
    const saved = await Result.findOne();
    expect(saved.scores.exam).toBe(50);
    expect(saved.position).toBe(1); // class statistics were recomputed
  });
});

describe('library borrowing', () => {
  it('cannot issue the last copy twice when two requests race', async () => {
    const librarian = await makeUser('Admin');
    const a = await makeUser('Student');
    const b = await makeUser('Student');
    const book = await Book.create({
      title: 'Atlas',
      author: 'X',
      category: 'Reference',
      totalCopies: 1,
    });
    as(librarian);

    const borrow = (who) =>
      request(app)
        .post('/library/borrow')
        .send({ bookId: String(book._id), borrowerId: String(who._id) });

    const [r1, r2] = await Promise.all([borrow(a), borrow(b)]);

    expect([r1.status, r2.status].sort()).toEqual([201, 400]);
    expect((await Book.findById(book._id)).availableCopies).toBe(0);
    expect(await BorrowRecord.countDocuments()).toBe(1);
  });

  it('records an admin borrower as Staff', async () => {
    const admin = await makeUser('Admin');
    const book = await Book.create({
      title: 'T',
      author: 'A',
      category: 'C',
      totalCopies: 2,
    });
    as(admin);

    const res = await request(app)
      .post('/library/borrow')
      .send({ bookId: String(book._id), borrowerId: String(admin._id) });

    expect(res.status).toBe(201);
    expect((await BorrowRecord.findOne()).borrowerRole).toBe('Staff');
  });
});

describe('fees and manual payments', () => {
  let student;
  let fee;

  beforeEach(async () => {
    const cls = await Class.create({
      name: 'JSS1',
      level: 'JSS',
      academicYear: YEAR,
    });
    student = await makeUser('Student', {
      studentProfile: { class: cls._id },
    });
    fee = await Fees.create({
      title: 'JSS1 First Term',
      class: cls._id,
      term: 'First Term',
      academicYear: YEAR,
      items: [{ label: 'Tuition', amount: 50000 }],
      dueDate: new Date(Date.now() + 30 * 864e5),
    });
  });

  it('keeps cash and bank transfer in separate records', async () => {
    as(await makeUser('Admin'));
    const pay = (amountPaid, gateway) =>
      request(app)
        .post('/payments/manual')
        .send({
          studentId: String(student._id),
          feeStructureId: String(fee._id),
          amountPaid,
          gateway,
        });

    expect((await pay(10000, 'Cash')).status).toBe(201);
    expect((await pay(5000, 'Bank Transfer')).status).toBe(201);
    expect((await pay(2000, 'Cash')).status).toBe(201);

    const records = await Payment.find({ student: student._id }).sort({
      gateway: 1,
    });
    expect(records.map((r) => [r.gateway, r.amountPaid])).toEqual([
      ['Bank Transfer', 5000],
      ['Cash', 12000],
    ]);
  });

  it('recomputes the total when the items of a fee are edited', async () => {
    as(await makeUser('Admin'));

    const res = await request(app)
      .put(`/fees/${fee._id}`)
      .send({
        items: [
          { label: 'Tuition', amount: 50000 },
          { label: 'Books', amount: 7500 },
        ],
        totalAmount: 1, // a client-supplied total must be ignored
      });

    expect(res.status).toBe(200);
    expect(res.body.data.fee.totalAmount).toBe(57500);
    expect((await Fees.findById(fee._id)).totalAmount).toBe(57500);
  });
});

describe('certificate downloads', () => {
  it('serves the stored PDF only to the student it belongs to', async () => {
    const admin = await makeUser('Admin');
    const ada = await makeUser('Student');
    const bola = await makeUser('Student');
    const pdf = Buffer.from('%PDF-1.4 stored in the database');
    const cert = await Certificate.create({
      certificateType: 'Report Card',
      student: ada._id,
      data: {},
      issuedBy: admin._id,
      status: 'Issued',
      pdfData: pdf,
      pdfSize: pdf.length,
    });

    as(ada);
    const own = await request(app).get(`/certificates/${cert._id}/download`);
    expect(own.status).toBe(200);
    expect(own.headers['content-type']).toMatch(/application\/pdf/);
    expect(Buffer.compare(own.body, pdf)).toBe(0);

    as(bola);
    expect(
      (await request(app).get(`/certificates/${cert._id}/download`)).status,
    ).toBe(403);

    await Certificate.updateOne({ _id: cert._id }, { status: 'Revoked' });
    as(ada);
    expect(
      (await request(app).get(`/certificates/${cert._id}/download`)).status,
    ).toBe(403);
  });
});
