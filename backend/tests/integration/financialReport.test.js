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
const { Fees, Payment } = require('../../src/models/Fees');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  getFinancialReport,
} = require('../../src/controllers/paymentController');
const { buildFeeLedger } = require('../../src/services/feeLedgerService');

const TERM = 'First Term';
const YEAR = '2025/2026';
const FEE_TOTAL = 50000;

let admin;
let jss1;
let jss2;
let fee;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = admin;
  next();
});
app.get('/payments/report', getFinancialReport);
app.use(errorHandler);

const report = (query = {}) =>
  request(app)
    .get('/payments/report')
    .query({ term: TERM, academicYear: YEAR, ...query });

const makeStudent = (name, classId) =>
  User.create({
    firstName: name,
    lastName: 'Test',
    email: `${name.toLowerCase()}@school.ng`,
    password: 'password123',
    role: 'Student',
    studentProfile: { class: classId, profileStatus: 'Active' },
  });

const pay = (student, amount, overrides = {}) =>
  new Payment({
    student: student._id,
    feeStructure: fee._id,
    term: TERM,
    academicYear: YEAR,
    amountPaid: amount,
    amountDue: amount,
    gateway: 'Paystack',
    transactionRef: `REF-${new mongoose.Types.ObjectId()}`,
    ...overrides,
  }).save();

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();

  admin = await User.create({
    firstName: 'Admin',
    lastName: 'User',
    email: 'admin@school.ng',
    password: 'password123',
    role: 'Admin',
  });

  jss1 = await Class.create({ name: 'JSS1', level: 'JSS', academicYear: YEAR });
  jss2 = await Class.create({ name: 'JSS2', level: 'JSS', academicYear: YEAR });

  fee = await Fees.create({
    title: 'JSS1 Fees',
    class: jss1._id,
    term: TERM,
    academicYear: YEAR,
    items: [{ label: 'Tuition', amount: FEE_TOTAL }],
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
});

describe('Financial report - expected revenue', () => {
  it('bills every enrolled student, including those who have never paid', async () => {
    await makeStudent('Ada', jss1._id);
    await makeStudent('Bola', jss1._id);
    await makeStudent('Chidi', jss1._id);

    const { body } = await report();

    // Three students x 50,000. Summing Payment.amountDue would have said 0,
    // and reported a 100% collection rate against nothing.
    expect(body.data.overview.totalExpected).toBe(150000);
    expect(body.data.overview.totalCollected).toBe(0);
    expect(body.data.overview.collectionRate).toBe(0);
  });

  it('does not inflate expected revenue with abandoned checkouts', async () => {
    const ada = await makeStudent('Ada', jss1._id);

    // Four abandoned attempts and one real payment - the shape that used to
    // report 250,000 expected against a 50,000 fee.
    for (let i = 0; i < 4; i += 1) {
      await pay(ada, 0, { amountDue: FEE_TOTAL, status: 'Pending' });
    }
    await pay(ada, FEE_TOTAL);

    const { body } = await report();

    expect(body.data.overview.totalExpected).toBe(FEE_TOTAL);
    expect(body.data.overview.totalCollected).toBe(FEE_TOTAL);
    expect(body.data.overview.totalOutstanding).toBe(0);
    expect(body.data.overview.collectionRate).toBe(100);
  });

  it('reports abandoned attempts separately rather than as debt', async () => {
    const ada = await makeStudent('Ada', jss1._id);
    await pay(ada, 0, { amountDue: FEE_TOTAL, status: 'Pending' });
    await pay(ada, 0, { amountDue: FEE_TOTAL, status: 'Pending' });

    const { body } = await report();

    expect(body.data.overview.abandonedAttempts).toBe(2);
    expect(body.data.overview.totalExpected).toBe(FEE_TOTAL);
  });

  it('counts a fee settled in instalments once, not once per document', async () => {
    const ada = await makeStudent('Ada', jss1._id);
    await pay(ada, 20000);
    await pay(ada, 20000, { gateway: 'Cash' });
    await pay(ada, 10000, { gateway: 'Bank Transfer' });

    const { body } = await report();

    expect(body.data.overview.totalExpected).toBe(FEE_TOTAL);
    expect(body.data.overview.totalCollected).toBe(FEE_TOTAL);
    expect(body.data.overview.studentsOwing).toBe(0);
  });

  it('does not let an overpayment on one student mask another debt', async () => {
    const ada = await makeStudent('Ada', jss1._id);
    await makeStudent('Bola', jss1._id);
    await pay(ada, 80000); // duplicate payment, 30,000 over

    const { body } = await report();

    expect(body.data.overview.totalExpected).toBe(100000);
    expect(body.data.overview.totalCollected).toBe(FEE_TOTAL); // capped
    expect(body.data.overview.totalOutstanding).toBe(FEE_TOTAL);
    expect(body.data.overview.studentsOwing).toBe(1);
  });

  it('honours the classId filter instead of silently reporting the school', async () => {
    await makeStudent('Ada', jss1._id);
    await Fees.create({
      title: 'JSS2 Fees',
      class: jss2._id,
      term: TERM,
      academicYear: YEAR,
      items: [{ label: 'Tuition', amount: 70000 }],
      dueDate: new Date(),
    });
    await makeStudent('Bola', jss2._id);

    const all = await report();
    expect(all.body.data.overview.totalExpected).toBe(120000);

    const scoped = await report({ classId: String(jss1._id) });
    expect(scoped.body.data.overview.totalExpected).toBe(FEE_TOTAL);
  });

  it('reports nothing owed when no fee structure has been raised', async () => {
    await Fees.deleteMany({});
    await makeStudent('Ada', jss1._id);

    const { body } = await report();

    expect(body.data.overview.totalExpected).toBe(0);
    expect(body.data.overview.hasStructures).toBe(false);
    expect(body.data.overview.collectionRate).toBe(0);
  });
});

describe('buildFeeLedger', () => {
  it('treats a student with no profileStatus as enrolled', async () => {
    // findByIdAndUpdate does not apply schema defaults, so students edited
    // rather than created can be missing the field entirely.
    await User.collection.insertOne({
      firstName: 'Legacy',
      lastName: 'Student',
      email: 'legacy@school.ng',
      password: 'x',
      role: 'Student',
      studentProfile: { class: jss1._id },
    });

    const ledger = await buildFeeLedger({ term: TERM, academicYear: YEAR });

    expect(ledger.billed).toBe(FEE_TOTAL);
    expect(ledger.studentsBilled).toBe(1);
  });

  it('excludes an inactive fee structure', async () => {
    await makeStudent('Ada', jss1._id);
    await Fees.updateOne({ _id: fee._id }, { $set: { isActive: false } });

    const ledger = await buildFeeLedger({ term: TERM, academicYear: YEAR });

    expect(ledger.hasStructures).toBe(false);
    expect(ledger.billed).toBe(0);
  });
});
