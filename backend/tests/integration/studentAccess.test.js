const express = require('express');
require('express-async-errors');
const request = require('supertest');
const mongoose = require('mongoose');
const db = require('../setup/db');

jest.mock('../../src/services/notificationService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendBulkEmails: jest.fn().mockResolvedValue({ sent: 0, failed: 0, total: 0 }),
  verifyTransport: jest.fn().mockResolvedValue(true),
  emailTemplates: new Proxy({}, { get: () => () => '<html></html>' }),
}));

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ success: true, queued: true }),
  enqueueBulkEmail: jest.fn().mockResolvedValue({ queued: 0, total: 0 }),
  startJobQueue: jest.fn(),
  stopJobQueue: jest.fn(),
}));

const User = require('../../src/models/User');
const Certificate = require('../../src/models/Certificate');
const certificateController = require('../../src/controllers/certificateController');
const caTrackingController = require('../../src/controllers/caTrackingController');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  checkStudentAccess,
  visibleStudentIds,
  scopeQueryToStudents,
} = require('../../src/utils/studentAccess');

/**
 * Two domains shipped with no ownership check at all: any signed-in account
 * could list every certificate in the school, or read any child's continuous
 * assessment by changing the id in the URL. Both now go through
 * `utils/studentAccess`.
 */

let admin;
let teacher;
let student;
let otherStudent;
let parent;
let otherParent;

// Acts as whoever the test sets, so the controllers see a real req.user.
let actingAs = null;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingAs;
  next();
});
app.get('/certificates', certificateController.getAllCertificates);
app.get('/certificates/:id', certificateController.getCertificateById);
app.get('/ca/student/:studentId', caTrackingController.getStudentTracking);
app.get('/ca/analytics/:studentId', caTrackingController.getStudentAnalytics);
app.get('/ca/chart/:studentId/:subjectId', caTrackingController.getChartData);
app.use(errorHandler);

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();

  admin = await User.create({
    firstName: 'A',
    lastName: 'Admin',
    email: 'a@s.ng',
    password: 'Password123',
    role: 'Admin',
  });
  teacher = await User.create({
    firstName: 'T',
    lastName: 'Teach',
    email: 't@s.ng',
    password: 'Password123',
    role: 'Teacher',
  });
  student = await User.create({
    firstName: 'Chidi',
    lastName: 'Mine',
    email: 's1@s.ng',
    password: 'Password123',
    role: 'Student',
  });
  otherStudent = await User.create({
    firstName: 'Ngozi',
    lastName: 'Outsider',
    email: 's2@s.ng',
    password: 'Password123',
    role: 'Student',
  });
  parent = await User.create({
    firstName: 'P',
    lastName: 'Mine',
    email: 'p1@s.ng',
    password: 'Password123',
    role: 'Parent',
    parentProfile: { children: [student._id] },
  });
  otherParent = await User.create({
    firstName: 'P2',
    lastName: 'Outsider',
    email: 'p2@s.ng',
    password: 'Password123',
    role: 'Parent',
    parentProfile: { children: [otherStudent._id] },
  });
});

const makeCertificate = (forStudent, marker) =>
  Certificate.create({
    student: forStudent._id,
    certificateType: 'School Leaving Certificate',
    academicYear: '2026/2027',
    issuedBy: admin._id,
    certificateNumber: marker,
    status: 'Issued',
    data: { note: marker },
  });

describe('studentAccess rules', () => {
  it('lets staff read anyone', () => {
    expect(checkStudentAccess(admin, otherStudent._id)).toBeNull();
    expect(checkStudentAccess(teacher, otherStudent._id)).toBeNull();
  });

  it('confines a student to themselves', () => {
    expect(checkStudentAccess(student, student._id)).toBeNull();
    expect(checkStudentAccess(student, otherStudent._id)).toMatch(/your own/);
  });

  it('confines a parent to their own children', () => {
    expect(checkStudentAccess(parent, student._id)).toBeNull();
    expect(checkStudentAccess(parent, otherStudent._id)).toMatch(
      /your own children/,
    );
  });

  it('distinguishes "no restriction" from "nothing visible"', () => {
    // null means staff — unrestricted. [] means a parent with no children,
    // who must see nothing. Collapsing them would show the whole school.
    expect(visibleStudentIds(admin)).toBeNull();

    const childless = { role: 'Parent', _id: new mongoose.Types.ObjectId() };
    expect(visibleStudentIds(childless)).toEqual([]);
  });

  it('does not widen a filter the caller already set', () => {
    const q = { student: String(otherStudent._id) };
    scopeQueryToStudents(q, parent);

    // Asked for a child that is not theirs — must match nothing, not everything.
    expect(q.student).toEqual({ $in: [] });
  });

  it('keeps a staff filter untouched', () => {
    const q = { student: String(otherStudent._id) };
    scopeQueryToStudents(q, admin);
    expect(q.student).toBe(String(otherStudent._id));
  });
});

describe('GET /certificates', () => {
  beforeEach(async () => {
    await makeCertificate(student, 'MINE-001');
    await makeCertificate(otherStudent, 'THEIRS-001');
  });

  it('shows an admin every certificate', async () => {
    actingAs = admin;
    const res = await request(app).get('/certificates');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).toContain('THEIRS-001');
    expect(res.body.data).toHaveLength(2);
  });

  it('shows a student only their own', async () => {
    actingAs = student;
    const res = await request(app).get('/certificates');

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(JSON.stringify(res.body)).toContain('MINE-001');
    expect(JSON.stringify(res.body)).not.toContain('THEIRS-001');
  });

  it("shows a parent only their own children's", async () => {
    actingAs = parent;
    const res = await request(app).get('/certificates');

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('THEIRS-001');
  });

  it('answers 200, not 201 — reading a list creates nothing', async () => {
    actingAs = admin;
    expect((await request(app).get('/certificates')).status).toBe(200);
  });

  it('cannot be widened by asking for another student explicitly', async () => {
    actingAs = parent;
    const res = await request(app)
      .get('/certificates')
      .query({ student: String(otherStudent._id) });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
  });
});

describe('GET /certificates/:id', () => {
  it('refuses a certificate belonging to another family', async () => {
    const theirs = await makeCertificate(otherStudent, 'THEIRS-002');

    actingAs = parent;
    const res = await request(app).get(`/certificates/${theirs._id}`);
    expect(res.status).toBe(403);

    actingAs = student;
    expect((await request(app).get(`/certificates/${theirs._id}`)).status).toBe(
      403,
    );
  });

  it('allows the family it belongs to', async () => {
    const mine = await makeCertificate(student, 'MINE-002');

    actingAs = parent;
    expect((await request(app).get(`/certificates/${mine._id}`)).status).toBe(
      200,
    );

    actingAs = student;
    expect((await request(app).get(`/certificates/${mine._id}`)).status).toBe(
      200,
    );
  });

  it('still 404s a certificate that does not exist', async () => {
    actingAs = admin;
    const res = await request(app).get(
      `/certificates/${new mongoose.Types.ObjectId()}`,
    );

    expect(res.status).toBe(404);
  });
});

describe('CA tracking ownership', () => {
  const routes = (id, subjectId) => [
    `/ca/student/${id}`,
    `/ca/analytics/${id}`,
    `/ca/chart/${id}/${subjectId}`,
  ];

  it("refuses another child's continuous assessment", async () => {
    const subjectId = new mongoose.Types.ObjectId();

    for (const url of routes(otherStudent._id, subjectId)) {
      actingAs = parent;
      expect((await request(app).get(url)).status).toBe(403);

      actingAs = student;
      expect((await request(app).get(url)).status).toBe(403);
    }
  });

  it('allows a parent their own child and a student themselves', async () => {
    const subjectId = new mongoose.Types.ObjectId();

    for (const url of routes(student._id, subjectId)) {
      actingAs = parent;
      expect((await request(app).get(url)).status).not.toBe(403);

      actingAs = student;
      expect((await request(app).get(url)).status).not.toBe(403);
    }
  });

  it('leaves staff unrestricted', async () => {
    const subjectId = new mongoose.Types.ObjectId();

    for (const url of routes(otherStudent._id, subjectId)) {
      actingAs = teacher;
      expect((await request(app).get(url)).status).not.toBe(403);
    }
  });

  it('refuses the other parent too, not just any parent', async () => {
    // Guards against a check that merely asks "is this a parent?"
    actingAs = otherParent;
    expect((await request(app).get(`/ca/student/${student._id}`)).status).toBe(
      403,
    );
  });
});
