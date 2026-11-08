/**
 * Students with no email: they are imported without one, sign in with their
 * admission number, and get their password from the admin on a printed slip.
 *
 * Built for a school whose registration sheet gave two-thirds of its pupils
 * their parent's address, or a sibling's, as their own. Imported as it was,
 * those rows could never all succeed, because one address is one account.
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
const Class = require('../../src/models/Class');
const Session = require('../../src/models/Session');
const AuditLog = require('../../src/models/AuditLog');
const validate = require('../../src/middleware/validate');
const errorHandler = require('../../src/middleware/errorHandler');
const { loginRules } = require('../../src/validators/authValidators');
const { login } = require('../../src/controllers/authController');
const {
  commitUserImport,
} = require('../../src/controllers/userImportController');
const { issueLoginSlip } = require('../../src/controllers/loginSlipController');
const { hasMailbox, emailMatches } = require('../../src/utils/mailbox');

let actingUser;

const app = express();
app.set('trust proxy', true);
app.use(express.json());
app.post('/auth/login', validate(loginRules), login);
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.post('/users/import', commitUserImport);
app.post('/users/:id/login-slip', issueLoginSlip);
app.use(errorHandler);

let jss1;

const row = (line, fields) => ({ _line: line, ...fields });

const importStudents = (rows) =>
  request(app).post('/users/import').send({ role: 'Student', rows });

const signIn = (identifier, password) =>
  request(app).post('/auth/login').send({ identifier, password });

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  enqueueEmail.mockClear();
  actingUser = await User.create({
    firstName: 'Head',
    lastName: 'Admin',
    email: 'admin@school.ng',
    password: 'admin-password-1',
    role: 'Admin',
  });
  jss1 = await Class.create({
    name: 'JSS 1',
    level: 'JSS',
    sections: [{ name: 'A' }],
  });
});

describe('a student with no email', () => {
  it('gets an address that can never receive mail, and does not collide', async () => {
    const a = await User.create({
      firstName: 'Ada',
      lastName: 'Obi',
      password: 'password123',
      role: 'Student',
    });
    const b = await User.create({
      firstName: 'Emeka',
      lastName: 'Obi',
      password: 'password123',
      role: 'Student',
    });

    expect(hasMailbox(a.email)).toBe(false);
    expect(a.email).not.toBe(b.email);
    expect(a.studentProfile.admissionNumber).toBeTruthy();
  });

  it('is not found by searching for words in the placeholder address', async () => {
    await User.create({
      firstName: 'Ada',
      lastName: 'Obi',
      password: 'password123',
      role: 'Student',
    });
    await User.create({
      firstName: 'Bola',
      lastName: 'Ade',
      email: 'student.bola@school.ng',
      password: 'password123',
      role: 'Student',
    });

    const found = await User.find(emailMatches(/student/i)).lean();

    expect(found.map((u) => u.firstName)).toEqual(['Bola']);
  });

  it('is never filled in for staff, who still need a real address', async () => {
    await expect(
      User.create({
        firstName: 'Ngozi',
        lastName: 'Eze',
        password: 'password123',
        role: 'Teacher',
      }),
    ).rejects.toThrow(/Email is required/);
  });
});

describe('signing in with an admission number', () => {
  let student;

  beforeEach(async () => {
    student = await User.create({
      firstName: 'Ada',
      lastName: 'Obi',
      password: 'kite-mango-42',
      role: 'Student',
    });
  });

  it('works, however the number was typed', async () => {
    const typed = ` ${student.studentProfile.admissionNumber.toLowerCase()} `;

    const res = await signIn(typed, 'kite-mango-42');

    expect(res.status).toBe(200);
    expect(res.body.data.user._id).toBe(String(student._id));
    expect(res.body.data.accessToken).toBeTruthy();
  });

  it('refuses the wrong password', async () => {
    const res = await signIn(
      student.studentProfile.admissionNumber,
      'wrong-password',
    );

    expect(res.status).toBe(401);
  });

  it('refuses a number nobody holds, with the same answer', async () => {
    const res = await signIn('ZZ999999', 'kite-mango-42');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  it('only ever finds a student, never a teacher by staff id', async () => {
    const teacher = await User.create({
      firstName: 'Ngozi',
      lastName: 'Eze',
      email: 'ngozi@school.ng',
      password: 'teacher-pass-1',
      role: 'Teacher',
    });

    const res = await signIn(teacher.teacherProfile.staffId, 'teacher-pass-1');

    expect(res.status).toBe(401);
  });

  it('leaves signing in by email exactly as it was', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: 'Admin@School.ng', password: 'admin-password-1' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('Admin');
  });
});

describe('importing students with no email', () => {
  it('creates them and hands back one slip each, never emailed', async () => {
    const res = await importStudents([
      row(2, { firstname: 'Ada', lastname: 'Obi', class: 'JSS 1' }),
      row(3, { firstname: 'Emeka', lastname: 'Obi', class: 'jss 1' }),
    ]);

    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.data.summary.created).toBe(2);
    expect(res.body.data.slips).toHaveLength(2);
    expect(enqueueEmail).not.toHaveBeenCalled();

    const [slip] = res.body.data.slips;
    expect(slip).toMatchObject({
      firstName: 'Ada',
      lastName: 'Obi',
      className: 'JSS 1',
    });
    expect(slip.password).toMatch(/^[a-z]+-[a-z]+-\d{2}$/);

    // The slip is what the child is given, so it has to work.
    const signedIn = await signIn(slip.admissionNumber, slip.password);
    expect(signedIn.status).toBe(200);
  });

  it('never repeats a password outside the slip', async () => {
    const res = await importStudents([
      row(2, { firstname: 'Ada', lastname: 'Obi' }),
    ]);
    const { password } = res.body.data.slips[0];

    expect(JSON.stringify(res.body.data.created)).not.toContain(password);

    const logged = await AuditLog.find().lean();
    expect(JSON.stringify(logged)).not.toContain(password);

    const stored = await User.findOne({ firstName: 'Ada' })
      .select('+password')
      .lean();
    expect(stored.password).not.toBe(password);
  });

  it('still emails a student who does have an address, and gives them no slip', async () => {
    const res = await importStudents([
      row(2, { firstname: 'Ada', lastname: 'Obi', email: 'ada@school.ng' }),
      row(3, { firstname: 'Emeka', lastname: 'Obi' }),
    ]);

    expect(res.body.data.slips.map((s) => s.firstName)).toEqual(['Emeka']);
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(enqueueEmail.mock.calls[0][0].to).toBe('ada@school.ng');
  });

  it('refuses to enrol the same child twice when a file is run again', async () => {
    const rows = [
      row(2, { firstname: 'Ada', lastname: 'Obi', class: 'JSS 1' }),
    ];
    await importStudents(rows);

    const again = await importStudents([
      row(2, { firstname: 'ada', lastname: 'OBI', class: 'JSS 1' }),
    ]);

    expect(again.body.data.summary.created).toBe(0);
    expect(again.body.data.failed[0].errors.join(' ')).toMatch(
      /already enrolled in JSS 1/,
    );
    expect(await User.countDocuments({ role: 'Student' })).toBe(1);
  });

  it('refuses a child listed twice in one class in the same file', async () => {
    const res = await importStudents([
      row(2, { firstname: 'Ada', lastname: 'Obi', class: 'JSS 1' }),
      row(3, { firstname: 'Ada', lastname: 'Obi', class: 'JSS 1' }),
    ]);

    expect(res.body.data.summary.created).toBe(0);
    expect(res.body.data.failed[0].errors.join(' ')).toMatch(
      /more than once in JSS 1/,
    );
  });

  it('links a parent, so siblings with no email share one parent account', async () => {
    const parent = {
      parentfirstname: 'Chinwe',
      parentlastname: 'Obi',
      parentemail: 'chinwe@school.ng',
      parentrelationship: 'Mother',
    };

    const res = await importStudents([
      row(2, { firstname: 'Ada', lastname: 'Obi', ...parent }),
      row(3, { firstname: 'Emeka', lastname: 'Obi', ...parent }),
    ]);

    expect(res.body.data.summary.parentsCreated).toBe(1);
    expect(res.body.data.summary.parentsLinked).toBe(2);

    const mother = await User.findOne({ email: 'chinwe@school.ng' });
    expect(mother.parentProfile.children).toHaveLength(2);
    // The mother is emailed her own password; the children get slips.
    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    expect(enqueueEmail.mock.calls[0][0].to).toBe('chinwe@school.ng');
  });
});

describe('issuing a new login slip', () => {
  let student;

  beforeEach(async () => {
    student = await User.create({
      firstName: 'Ada',
      lastName: 'Obi',
      password: 'old-password-1',
      role: 'Student',
      studentProfile: { class: jss1._id },
    });
  });

  it('replaces the password and ends every session the student had', async () => {
    await signIn(student.studentProfile.admissionNumber, 'old-password-1');
    expect(await Session.countDocuments({ user: student._id })).toBe(1);

    const res = await request(app).post(`/users/${student._id}/login-slip`);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const { slip } = res.body.data;
    expect(slip.className).toBe('JSS 1');
    expect(slip.email).toBeNull();

    expect(await Session.countDocuments({ user: student._id })).toBe(0);
    expect((await signIn(slip.admissionNumber, 'old-password-1')).status).toBe(
      401,
    );
    expect((await signIn(slip.admissionNumber, slip.password)).status).toBe(
      200,
    );
  });

  it('is recorded against the student, without the password', async () => {
    const res = await request(app).post(`/users/${student._id}/login-slip`);

    const entry = await AuditLog.findOne({ action: 'auth.login_slip' }).lean();
    expect(String(entry.subject)).toBe(String(student._id));
    expect(JSON.stringify(entry)).not.toContain(res.body.data.slip.password);
  });

  it('is for students only', async () => {
    const res = await request(app).post(`/users/${actingUser._id}/login-slip`);

    expect(res.status).toBe(404);
  });
});
