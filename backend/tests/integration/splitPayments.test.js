const express = require('express');
const request = require('supertest');
const mongoose = require('mongoose');
require('express-async-errors');

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

jest.mock('../../src/services/auditService', () => ({
  record: jest.fn().mockResolvedValue(undefined),
}));

const { Fees, Payment } = require('../../src/models/Fees');
const User = require('../../src/models/User');
const paymentService = require('../../src/services/paymentService');
const {
  recordManualPayment,
  getStudentFeeBalances,
} = require('../../src/controllers/paymentController');
const validate = require('../../src/middleware/validate');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  manualPaymentRules,
} = require('../../src/validators/paymentValidators');

const FEE_TOTAL = 45000;
const CLASS_ID = new mongoose.Types.ObjectId();

let student;
let feeStructure;
let actingUser;

/**
 * The payment routes under test, with authentication stubbed out — `protect`
 * is exercised elsewhere, and what matters here is what the handlers do with
 * the user they are handed.
 */
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.post('/payments/manual', validate(manualPaymentRules), recordManualPayment);
app.get('/payments/balance/:studentId', getStudentFeeBalances);
app.use(errorHandler);

const admin = () => ({
  _id: new mongoose.Types.ObjectId(),
  role: 'Admin',
});

/** A settled gateway transaction — the "paid part of it online" half. */
const onlinePayment = (amount, gateway = 'Paystack') =>
  Payment.create({
    student: student._id,
    feeStructure: feeStructure._id,
    term: 'First Term',
    academicYear: '2024/2025',
    amountPaid: amount,
    amountDue: amount,
    gateway,
    transactionRef: `SMP-${Math.random().toString(36).slice(2, 10)}`,
  });

const payCash = (amountPaid, extra = {}) =>
  request(app)
    .post('/payments/manual')
    .send({
      studentId: String(student._id),
      feeStructureId: String(feeStructure._id),
      amountPaid,
      gateway: 'Cash',
      ...extra,
    });

const balanceOf = () =>
  paymentService
    .getFeeBalances(student._id, [feeStructure])
    .then(([balance]) => balance);

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();

  actingUser = admin();

  student = await User.create({
    firstName: 'Ada',
    lastName: 'Obi',
    email: `ada${Date.now()}@example.com`,
    password: 'password123',
    role: 'Student',
    studentProfile: { class: CLASS_ID },
  });

  feeStructure = await Fees.create({
    title: 'JSS1 First Term',
    class: CLASS_ID,
    term: 'First Term',
    academicYear: '2024/2025',
    items: [{ label: 'Tuition', amount: FEE_TOTAL, isCompulsory: true }],
    dueDate: new Date('2099-10-01'),
  });
});

describe('fee balance across both payment channels', () => {
  it('splits what has been received into online and over-the-counter', async () => {
    await onlinePayment(20000);
    await payCash(15000);

    const balance = await balanceOf();

    expect(balance.paidOnline).toBe(20000);
    expect(balance.paidOffline).toBe(15000);
    expect(balance.paidTotal).toBe(35000);
    expect(balance.outstanding).toBe(10000);
    expect(balance.status).toBe('Partial');
  });

  it('does not call the fee paid just because a part-payment settled', async () => {
    // The bug this guards: a ₦20,000 instalment is a Payment document with
    // amountDue === amountPaid, so its own status is 'Paid'. Reading that as
    // the fee's status told the parent a fee they still owed ₦25,000 on was
    // fully settled.
    const instalment = await onlinePayment(20000);
    expect(instalment.status).toBe('Paid');

    const balance = await balanceOf();
    expect(balance.status).toBe('Partial');
    expect(balance.outstanding).toBe(25000);
    expect(balance.percentPaid).toBe(44);
  });

  it('marks the fee Paid once the two channels together cover it', async () => {
    await onlinePayment(20000);
    await payCash(25000);

    const balance = await balanceOf();
    expect(balance.outstanding).toBe(0);
    expect(balance.status).toBe('Paid');
    expect(balance.percentPaid).toBe(100);
  });

  it('counts a bank transfer as over-the-counter money', async () => {
    await payCash(5000, { gateway: 'Bank Transfer' });

    const balance = await balanceOf();
    expect(balance.paidOffline).toBe(5000);
    expect(balance.paidOnline).toBe(0);
  });

  it('reports an untouched fee past its due date as Overdue', async () => {
    feeStructure.dueDate = new Date('2020-01-01');
    await feeStructure.save();

    const balance = await balanceOf();
    expect(balance.status).toBe('Overdue');
    expect(balance.outstanding).toBe(FEE_TOTAL);
  });

  it("ignores another student's payments against the same fee", async () => {
    const other = await User.create({
      firstName: 'Bola',
      lastName: 'Ade',
      email: `bola${Date.now()}@example.com`,
      password: 'password123',
      role: 'Student',
      studentProfile: { class: CLASS_ID },
    });

    await Payment.create({
      student: other._id,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: FEE_TOTAL,
      amountDue: FEE_TOTAL,
      gateway: 'Cash',
    });

    const balance = await balanceOf();
    expect(balance.paidTotal).toBe(0);
    expect(balance.outstanding).toBe(FEE_TOTAL);
  });
});

describe('paying the remainder in cash', () => {
  it('accepts cash for exactly what is left after an online part-payment', async () => {
    await onlinePayment(20000);

    const res = await payCash(25000);

    expect(res.status).toBe(201);
    expect(res.body.data.outstanding).toBe(0);
    expect(res.body.data.payment.amountPaid).toBe(25000);
    expect((await balanceOf()).status).toBe('Paid');
  });

  it('refuses cash above what the fee still owes', async () => {
    await onlinePayment(20000);

    const res = await payCash(FEE_TOTAL);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceeds the outstanding balance/i);
    expect((await balanceOf()).paidOffline).toBe(0);
  });

  it('bills the cash record only for what online payments left behind', async () => {
    await onlinePayment(20000);
    await payCash(25000);

    const cash = await Payment.findOne({
      student: student._id,
      gateway: 'Cash',
    });

    // Charging the cash record the whole ₦45,000 would double-count the part
    // already settled online and pin it on 'Partial' for good.
    expect(cash.amountDue).toBe(25000);
    expect(cash.balance).toBe(0);
    expect(cash.status).toBe('Paid');
  });

  it('accumulates repeat cash instalments onto one record', async () => {
    await payCash(10000);
    await payCash(5000);

    const cashRecords = await Payment.find({
      student: student._id,
      gateway: 'Cash',
    });

    expect(cashRecords).toHaveLength(1);
    expect(cashRecords[0].amountPaid).toBe(15000);
    expect(cashRecords[0].balance).toBe(30000);
    expect((await balanceOf()).outstanding).toBe(30000);
  });

  it('refuses cash on a fee that is already settled', async () => {
    await onlinePayment(FEE_TOTAL);

    const res = await payCash(1000);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already been fully paid/i);
  });

  it('takes a remainder smaller than the gateway minimum', async () => {
    // ₦40 is below what any gateway will accept, which is precisely why the
    // family is at the office counter with it.
    await onlinePayment(FEE_TOTAL - 40);

    const res = await payCash(40);

    expect(res.status).toBe(201);
    expect((await balanceOf()).status).toBe('Paid');
  });
});

describe('resolvePayableAmount with a part-paid fee', () => {
  it('offers only the remainder when no amount is requested', async () => {
    await payCash(15000);

    const { amount, outstanding } = await paymentService.resolvePayableAmount({
      studentId: student._id,
      feeStructure,
    });

    expect(amount).toBe(30000);
    expect(outstanding).toBe(30000);
  });

  it('lets the payer clear an exact remainder below the gateway minimum', async () => {
    await payCash(FEE_TOTAL - 40);

    const { amount } = await paymentService.resolvePayableAmount({
      studentId: student._id,
      feeStructure,
      requestedAmount: 40,
    });

    expect(amount).toBe(40);
  });

  it('still refuses a token part-payment that leaves a balance behind', async () => {
    await expect(
      paymentService.resolvePayableAmount({
        studentId: student._id,
        feeStructure,
        requestedAmount: 40,
      }),
    ).rejects.toThrow(/minimum part-payment/i);
  });
});

describe('GET /payments/balance/:studentId', () => {
  it("returns every fee for the student's class with its split", async () => {
    await onlinePayment(20000);
    await payCash(5000);

    const res = await request(app).get(
      `/payments/balance/${student._id}?term=First Term&academicYear=2024/2025`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.balances).toHaveLength(1);
    expect(res.body.data.totals).toMatchObject({
      totalAmount: FEE_TOTAL,
      paidOnline: 20000,
      paidOffline: 5000,
      paidTotal: 25000,
      outstanding: 20000,
    });
  });

  it('excludes fee structures set for another class', async () => {
    await Fees.create({
      title: 'JSS2 First Term',
      class: new mongoose.Types.ObjectId(),
      term: 'First Term',
      academicYear: '2024/2025',
      items: [{ label: 'Tuition', amount: 99000 }],
      dueDate: new Date('2099-10-01'),
    });

    const res = await request(app).get(`/payments/balance/${student._id}`);

    expect(res.body.data.balances).toHaveLength(1);
    expect(res.body.data.balances[0].totalAmount).toBe(FEE_TOTAL);
  });

  it('refuses a parent asking about a child that is not theirs', async () => {
    actingUser = {
      _id: new mongoose.Types.ObjectId(),
      role: 'Parent',
      parentProfile: { children: [new mongoose.Types.ObjectId()] },
    };

    const res = await request(app).get(`/payments/balance/${student._id}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/only view your own children/i);
  });

  it('lets a parent see their own child', async () => {
    actingUser = {
      _id: new mongoose.Types.ObjectId(),
      role: 'Parent',
      parentProfile: { children: [student._id] },
    };

    const res = await request(app).get(`/payments/balance/${student._id}`);

    expect(res.status).toBe(200);
  });
});
