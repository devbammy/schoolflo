const crypto = require('crypto');
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

jest.mock('../../src/services/pdfService', () => ({
  generateAdmissionLetter: jest
    .fn()
    .mockResolvedValue({ buffer: Buffer.from('%PDF-test') }),
}));

const { enqueueEmail } = require('../../src/services/jobQueue');
const User = require('../../src/models/User');
const Class = require('../../src/models/Class');
const Session = require('../../src/models/Session');
const AuditLog = require('../../src/models/AuditLog');
const Certificate = require('../../src/models/Certificate');
const { Fees, Payment } = require('../../src/models/Fees');
const errorHandler = require('../../src/middleware/errorHandler');
const webhookRoutes = require('../../src/routes/webhooks');
const {
  recordManualPayment,
  verifyPaystackPayment,
} = require('../../src/controllers/paymentController');
const {
  createParent,
  linkChild,
  deleteParent,
} = require('../../src/controllers/parentController');
const {
  generateAdmissionLetter,
} = require('../../src/controllers/certificateController');
const { register, login } = require('../../src/controllers/authController');
const { checkEnv } = require('../../src/config/env');

const SECRET = 'sk_test_accountability';
const YEAR = '2025/2026';

let actingUser;
let n = 0;

const app = express();
app.use('/webhooks', webhookRoutes);
app.use(express.json());
app.post('/login', login);
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.post('/payments/manual', recordManualPayment);
app.post('/payments/verify', verifyPaystackPayment);
app.post('/parents', createParent);
app.patch('/parents/:id/children', linkChild);
app.delete('/parents/:id', deleteParent);
app.post('/certificates/admission-letter', generateAdmissionLetter);
app.post('/register', register);
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

const stubGateway = (amountKobo) => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({
      status: true,
      data: {
        status: 'success',
        amount: amountKobo,
        reference: 'REF',
        currency: 'NGN',
        paid_at: new Date().toISOString(),
      },
    }),
  });
};

const webhook = (reference) => {
  const body = JSON.stringify({ event: 'charge.success', data: { reference } });
  return request(app)
    .post('/webhooks/paystack')
    .set('Content-Type', 'application/json')
    .set(
      'x-paystack-signature',
      crypto.createHmac('sha512', SECRET).update(body).digest('hex'),
    )
    .send(body);
};

let admin;
let student;
let fee;

const makePending = (amountDue = 10000, ref = 'REF') =>
  Payment.create({
    student: student._id,
    feeStructure: fee._id,
    term: fee.term,
    academicYear: fee.academicYear,
    amountPaid: 0,
    amountDue,
    gateway: 'Paystack',
    transactionRef: ref,
  });

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  enqueueEmail.mockClear();
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  admin = await makeUser('Admin');
  actingUser = admin;
  const classDoc = await Class.create({ name: 'JSS1', level: 'JSS' });
  student = await makeUser('Student', {
    studentProfile: { class: classDoc._id },
  });
  fee = await Fees.create({
    title: 'Tuition',
    class: classDoc._id,
    term: 'First Term',
    academicYear: YEAR,
    items: [{ label: 'Tuition', amount: 45000 }],
    dueDate: new Date('2030-01-01'),
  });
});

describe('settlement is on the record whichever path it took', () => {
  it('records a payment settled by the webhook', async () => {
    stubGateway(1000000);
    const payment = await makePending();

    expect((await webhook('REF')).status).toBe(200);

    const entry = await AuditLog.findOne({ action: 'payment.settle' });
    expect(entry).not.toBeNull();
    expect(String(entry.entityId)).toBe(String(payment._id));
    expect(String(entry.subject)).toBe(String(student._id));
    expect(entry.meta.viaWebhook).toBe(true);
  });

  it('records it once when the gateway retries', async () => {
    stubGateway(1000000);
    await makePending();

    await webhook('REF');
    await webhook('REF');

    expect(await AuditLog.countDocuments({ action: 'payment.settle' })).toBe(1);
  });

  it('records it once when the redirect follows the webhook', async () => {
    stubGateway(1000000);
    await makePending();
    await webhook('REF');

    actingUser = student;
    const res = await request(app)
      .post('/payments/verify')
      .send({ reference: 'REF' });

    expect(res.status).toBe(200);
    expect(await AuditLog.countDocuments({ action: 'payment.settle' })).toBe(1);
  });

  it('does not email a second receipt for a retried underpayment', async () => {
    stubGateway(500000);
    await makePending(10000);

    await webhook('REF');
    await webhook('REF');

    expect(enqueueEmail).toHaveBeenCalledTimes(1);
  });
});

describe('cash instalments', () => {
  const pay = (amountPaid) =>
    request(app).post('/payments/manual').send({
      studentId: student._id,
      feeStructureId: fee._id,
      amountPaid,
      gateway: 'Cash',
    });

  it('gives each instalment its own receipt, amount and date', async () => {
    await pay(10000);
    await pay(5000);

    const stored = await Payment.findOne({ gateway: 'Cash' });

    expect(stored.amountPaid).toBe(15000);
    expect(stored.instalments.map((i) => i.amount)).toEqual([10000, 5000]);

    const [first, second] = stored.instalments;
    expect(first.receiptNumber).toMatch(/^RCP-/);
    expect(second.receiptNumber).toMatch(/^RCP-/);
    expect(second.receiptNumber).not.toBe(first.receiptNumber);
    expect(String(second.processedBy)).toBe(String(admin._id));
  });

  it('keeps the list adding up on a record from before instalments', async () => {
    await Payment.create({
      student: student._id,
      feeStructure: fee._id,
      term: fee.term,
      academicYear: fee.academicYear,
      amountPaid: 20000,
      amountDue: 45000,
      gateway: 'Cash',
      receiptNumber: 'RCP-OLD-1',
    });

    await pay(5000);

    const stored = await Payment.findOne({ gateway: 'Cash' });
    const sum = stored.instalments.reduce((s, i) => s + i.amount, 0);

    expect(sum).toBe(stored.amountPaid);
    expect(stored.instalments[0].receiptNumber).toBe('RCP-OLD-1');
  });
});

describe('parent accounts are on the record', () => {
  it('records creating a parent', async () => {
    const res = await request(app)
      .post('/parents')
      .send({
        firstName: 'Ada',
        lastName: 'Obi',
        email: 'ada@school.ng',
        password: 'password123',
        childrenIds: [student._id],
      });

    expect(res.status).toBe(201);
    expect(
      await AuditLog.countDocuments({
        action: 'user.create',
        entityId: res.body.data.parent._id,
      }),
    ).toBe(1);
  });

  it('refuses a child id that is not a student', async () => {
    const res = await request(app)
      .post('/parents')
      .send({
        firstName: 'Ada',
        lastName: 'Obi',
        email: 'ada@school.ng',
        password: 'password123',
        childrenIds: [admin._id],
      });

    expect(res.status).toBe(400);
    const stored = await User.findById(admin._id);
    expect(stored.studentProfile?.parentId).toBeUndefined();
  });

  it('records linking and unlinking against the child', async () => {
    const parent = await makeUser('Parent');

    for (const action of ['link', 'unlink']) {
      await request(app)
        .patch(`/parents/${parent._id}/children`)
        .send({ action, childId: student._id });
    }

    const entries = await AuditLog.find({ subject: student._id }).sort({
      createdAt: 1,
    });
    expect(entries.map((e) => e.action)).toEqual([
      'parent.link_child',
      'parent.unlink_child',
    ]);
  });

  it('records deleting a parent', async () => {
    const parent = await makeUser('Parent');

    await request(app).delete(`/parents/${parent._id}`);

    expect(
      await AuditLog.countDocuments({
        action: 'user.delete',
        entityId: parent._id,
      }),
    ).toBe(1);
  });

  it('falls back to the other parent when one is unlinked', async () => {
    const [first, second] = [
      await makeUser('Parent'),
      await makeUser('Parent'),
    ];
    for (const parent of [first, second]) {
      await request(app)
        .patch(`/parents/${parent._id}/children`)
        .send({ action: 'link', childId: student._id });
    }

    await request(app)
      .patch(`/parents/${second._id}/children`)
      .send({ action: 'unlink', childId: student._id });

    const child = await User.findById(student._id);
    expect(String(child.studentProfile.parentId)).toBe(String(first._id));
  });
});

describe('certificates', () => {
  const issue = () =>
    request(app)
      .post('/certificates/admission-letter')
      .send({ studentId: student._id });

  it('records issuing one against the student', async () => {
    const res = await issue();

    expect(res.status).toBe(201);
    const entry = await AuditLog.findOne({ action: 'certificate.issue' });
    expect(String(entry.subject)).toBe(String(student._id));
  });

  it('emails both parents, not just the one linked last', async () => {
    const [first, second] = [
      await makeUser('Parent'),
      await makeUser('Parent'),
    ];
    for (const parent of [first, second]) {
      await request(app)
        .patch(`/parents/${parent._id}/children`)
        .send({ action: 'link', childId: student._id });
    }

    await issue();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const recipients = enqueueEmail.mock.calls.map(([mail]) => mail.to);
    expect(recipients).toEqual(
      expect.arrayContaining([first.email, second.email]),
    );
  });

  it('gives simultaneous issues different numbers', async () => {
    const results = await Promise.all([issue(), issue(), issue(), issue()]);

    expect(results.every((r) => r.status === 201)).toBe(true);

    const numbers = (await Certificate.find()).map((c) => c.certificateNumber);
    expect(new Set(numbers).size).toBe(4);
  });

  it('carries on from a number already printed', async () => {
    const year = new Date().getFullYear();
    await Certificate.create({
      certificateType: 'Admission Letter',
      student: student._id,
      issuedBy: admin._id,
      data: {},
      certificateNumber: `ADM/${year}/00041`,
    });

    await issue();

    const latest = await Certificate.findOne().sort({ createdAt: -1 });
    expect(latest.certificateNumber).toBe(`ADM/${year}/00042`);
  });
});

describe('accounts', () => {
  it('gives an admin creating an account no way in as that person', async () => {
    const res = await request(app).post('/register').send({
      firstName: 'New',
      lastName: 'Teacher',
      email: 'new.teacher@school.ng',
      password: 'password123',
      role: 'Teacher',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.accessToken).toBeUndefined();
    expect(res.body.data.refreshToken).toBeUndefined();
    expect(await Session.countDocuments()).toBe(0);
  });

  it('does not reveal a deactivated account without its password', async () => {
    const user = await makeUser('Teacher', { isActive: false });

    const wrong = await request(app)
      .post('/login')
      .send({ email: user.email, password: 'not-the-password' });
    const right = await request(app)
      .post('/login')
      .send({ email: user.email, password: 'password123' });

    expect(wrong.body.message).toBe('Invalid credentials');
    expect(right.body.message).toMatch(/deactivated/i);
  });
});

describe('the environment check', () => {
  it('no longer warns that PDFs depend on Cloudinary', () => {
    const { warnings } = checkEnv({
      MONGO_URI: 'x',
      JWT_SECRET: 'a'.repeat(32),
      JWT_REFRESH_SECRET: 'b'.repeat(32),
    });

    expect(warnings.join(' ')).not.toMatch(/PDFs/);
  });
});
