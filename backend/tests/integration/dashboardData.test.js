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
const { Fees, Payment } = require('../../src/models/Fees');
const errorHandler = require('../../src/middleware/errorHandler');
const configRoutes = require('../../src/routes/config');
const {
  getAdminDashboard,
  getParentDashboard,
} = require('../../src/controllers/dashboardController');

const TERM = 'First Term';
const YEAR = '2025/2026';

let actingUser;
let n = 0;

const app = express();
app.use('/config', configRoutes);
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/dashboard/admin', getAdminDashboard);
app.get('/dashboard/parent', getParentDashboard);
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

let child;
let fee;

const pay = (amountPaid, gateway, amountDue = amountPaid) =>
  Payment.create({
    student: child._id,
    feeStructure: fee._id,
    term: TERM,
    academicYear: YEAR,
    amountPaid,
    amountDue,
    gateway,
  });

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  const classDoc = await Class.create({ name: 'JSS1', level: 'JSS' });
  child = await makeUser('Student', {
    studentProfile: { class: classDoc._id },
  });
  fee = await Fees.create({
    title: 'Tuition',
    class: classDoc._id,
    term: TERM,
    academicYear: YEAR,
    items: [{ label: 'Tuition', amount: 45000 }],
    dueDate: new Date('2030-01-01'),
  });
});

describe('the parent dashboard', () => {
  const load = async () => {
    actingUser = await makeUser('Parent', {
      parentProfile: { children: [child._id] },
    });
    const res = await request(app)
      .get('/dashboard/parent')
      .query({ term: TERM, academicYear: YEAR });
    return res.body.data.childrenData[0];
  };

  it('reports what the fee owes, not the latest instalment’s status', async () => {
    await pay(20000, 'Paystack');

    const entry = await load();

    expect(entry.latestPayment.status).toBe('Paid');
    expect(entry.feeBalance.status).toBe('Partial');
    expect(entry.feeBalance.outstanding).toBe(25000);
  });

  it('counts both channels towards the fee', async () => {
    await pay(20000, 'Paystack');
    await pay(25000, 'Cash');

    const entry = await load();

    expect(entry.feeBalance.status).toBe('Paid');
    expect(entry.feeBalance.outstanding).toBe(0);
  });

  it('has no balance for a child with no fee this term', async () => {
    await Fees.deleteMany({});

    const entry = await load();

    expect(entry.feeBalance).toBeNull();
  });
});

describe('the admin dashboard', () => {
  it('breaks this term’s money down by how it arrived', async () => {
    await pay(20000, 'Paystack');
    await pay(5000, 'Cash');
    // An abandoned checkout is not money.
    await pay(0, 'Flutterwave', 10000);
    actingUser = await makeUser('Admin');

    const res = await request(app)
      .get('/dashboard/admin')
      .query({ term: TERM, academicYear: YEAR });

    const modes = Object.fromEntries(
      res.body.data.feeModes.map((m) => [m.gateway, m.amount]),
    );
    expect(modes).toEqual({ Paystack: 20000, Cash: 5000 });
  });
});

describe('the public configuration', () => {
  const original = process.env.SCHOOL_NAME;

  afterEach(() => {
    process.env.SCHOOL_NAME = original;
  });

  it('names the school from SCHOOL_NAME', async () => {
    process.env.SCHOOL_NAME = 'Glory and Praise Prime Foundation';

    const res = await request(app).get('/config');

    expect(res.body.data.school.name).toBe('Glory and Praise Prime Foundation');
    expect(res.body.data.features).toBeDefined();
  });

  it('sends the one grading scale, for the score-entry pages', async () => {
    const { GRADE_SCALE } = require('../../src/config/constants');

    const res = await request(app).get('/config');

    expect(res.body.data.gradeScale).toEqual(GRADE_SCALE);
  });

  it('is null rather than blank when unset', async () => {
    process.env.SCHOOL_NAME = '  ';

    const res = await request(app).get('/config');

    expect(res.body.data.school.name).toBeNull();
  });
});
