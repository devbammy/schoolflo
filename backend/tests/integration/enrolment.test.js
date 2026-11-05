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
const Promotion = require('../../src/models/Promotion');
const CATracker = require('../../src/models/CATracker');
const Subject = require('../../src/models/Subject');
const AuditLog = require('../../src/models/AuditLog');
const { Result } = require('../../src/models/Exam');
const { Fees, Payment } = require('../../src/models/Fees');
const errorHandler = require('../../src/middleware/errorHandler');
const { buildFeeLedger } = require('../../src/services/feeLedgerService');
const promotionService = require('../../src/services/promotionService');
const {
  getStudentFeeBalances,
} = require('../../src/controllers/paymentController');
const {
  getClassRegister,
} = require('../../src/controllers/attendanceController');
const {
  applyPromotions,
} = require('../../src/controllers/promotionController');
const { missingEnrolments } = require('../../src/utils/migrateEnrolments');

const LAST = '2024/2025';
const THIS = '2025/2026';

let actingUser;
let n = 0;

const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/balance/:studentId', getStudentFeeBalances);
app.get('/register/:classId', getClassRegister);
app.post('/promotions/:id/apply', applyPromotions);
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

const makeFee = (classDoc, academicYear, term = 'First Term') =>
  Fees.create({
    title: `${classDoc.name} ${academicYear} ${term}`,
    class: classDoc._id,
    term,
    academicYear,
    items: [{ label: 'Tuition', amount: 10000 }],
    dueDate: new Date('2030-01-01'),
  });

// A batch as autoProcess would leave it, so each test states only the outcome.
const makeBatch = (from, to, admin, entries) =>
  Promotion.create({
    academicYear: LAST,
    fromClass: from._id,
    toClass: to?._id,
    createdBy: admin._id,
    status: 'Completed',
    students: entries,
  });

let admin;
let jss1;
let jss2;

beforeAll(db.connect);
afterAll(db.close);

beforeEach(async () => {
  await db.clear();
  admin = await makeUser('Admin');
  actingUser = admin;
  jss1 = await Class.create({ name: 'JSS1', level: 'JSS', academicYear: THIS });
  jss2 = await Class.create({ name: 'JSS2', level: 'JSS', academicYear: THIS });
});

describe('fees follow the session, not the current class', () => {
  const promoteOne = async () => {
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, jss2, admin, [
      { student: student._id, status: 'Promoted', promotedTo: jss2._id },
    ]);
    await promotionService.applyPromotions(batch._id, admin._id);
    return student;
  };

  it('keeps an unpaid fee on the balance after promotion', async () => {
    const oldFee = await makeFee(jss1, LAST);
    const student = await promoteOne();

    const res = await request(app).get(`/balance/${student._id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.balances.map((b) => b.feeStructure._id)).toContain(
      String(oldFee._id),
    );
    expect(res.body.data.totals.outstanding).toBe(10000);
  });

  it('reports an earlier debt as arrears when asked about the current term', async () => {
    await makeFee(jss1, LAST);
    const current = await makeFee(jss2, THIS);
    const student = await promoteOne();

    const res = await request(app)
      .get(`/balance/${student._id}`)
      .query({ term: 'First Term', academicYear: THIS });

    expect(res.body.data.balances.map((b) => b.feeStructure._id)).toEqual([
      String(current._id),
    ]);
    expect(res.body.data.arrears).toHaveLength(1);
    expect(res.body.data.arrearsTotal).toBe(10000);
  });

  it('does not count a later term of the same session as arrears', async () => {
    await makeFee(jss1, THIS, 'Second Term');
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });

    const res = await request(app)
      .get(`/balance/${student._id}`)
      .query({ term: 'First Term', academicYear: THIS });

    expect(res.body.data.arrears).toHaveLength(0);
  });

  it('does not bill a promoted student for the new class’s closed session', async () => {
    const closed = await makeFee(jss2, LAST);
    const student = await promoteOne();

    const res = await request(app).get(`/balance/${student._id}`);

    expect(res.body.data.balances.map((b) => b.feeStructure._id)).not.toContain(
      String(closed._id),
    );
  });

  it('bills the closed session to the cohort who were in the class that year', async () => {
    await makeFee(jss1, LAST);
    await makeFee(jss2, LAST);
    await promoteOne();

    const ledger = await buildFeeLedger({ academicYear: LAST });
    const byClass = (classDoc) =>
      ledger.structures.find(
        (s) => String(s.fee.class) === String(classDoc._id),
      );

    expect(byClass(jss1).students).toHaveLength(1);
    expect(byClass(jss2).students).toHaveLength(0);
    expect(ledger.billed).toBe(10000);
  });

  it('keeps a graduate’s final-year debt in the ledger', async () => {
    await makeFee(jss1, LAST);
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, null, admin, [
      { student: student._id, status: 'Graduated' },
    ]);
    await promotionService.applyPromotions(batch._id, admin._id);

    const ledger = await buildFeeLedger({ academicYear: LAST });

    expect(ledger.outstanding).toBe(10000);
    expect(ledger.studentsOwing).toBe(1);
  });

  it('does not bill a graduate for sessions after they left', async () => {
    await makeFee(jss1, THIS);
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, null, admin, [
      { student: student._id, status: 'Graduated' },
    ]);
    await promotionService.applyPromotions(batch._id, admin._id);

    const ledger = await buildFeeLedger({ academicYear: THIS });

    expect(ledger.billed).toBe(0);
  });

  it('shows a fee the student paid towards even if nothing else links it', async () => {
    const fee = await makeFee(jss2, LAST);
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    await Payment.create({
      student: student._id,
      feeStructure: fee._id,
      term: fee.term,
      academicYear: fee.academicYear,
      amountPaid: 4000,
      amountDue: 10000,
      gateway: 'Cash',
    });

    const res = await request(app).get(`/balance/${student._id}`);

    expect(res.body.data.balances.map((b) => b.feeStructure._id)).toContain(
      String(fee._id),
    );
  });
});

describe('students who have left are off the rosters', () => {
  it('drops graduates and withdrawn students from the register', async () => {
    const current = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const graduate = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const withdrawn = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, null, admin, [
      { student: graduate._id, status: 'Graduated' },
      { student: withdrawn._id, status: 'Withdrawn' },
    ]);
    await promotionService.applyPromotions(batch._id, admin._id);

    const res = await request(app).get(`/register/${jss1._id}`);

    expect(res.body.data.students.map((s) => s._id)).toEqual([
      String(current._id),
    ]);
  });

  it('leaves last year’s graduates out of this year’s batch', async () => {
    const graduate = await makeUser('Student', {
      studentProfile: { class: jss1._id, profileStatus: 'Graduated' },
    });
    const current = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await Promotion.create({
      academicYear: THIS,
      fromClass: jss1._id,
      toClass: jss2._id,
      createdBy: admin._id,
    });

    const processed = await promotionService.autoProcessPromotion(
      batch._id,
      admin._id,
    );
    const ids = processed.students.map((s) => String(s.student));

    expect(ids).toContain(String(current._id));
    expect(ids).not.toContain(String(graduate._id));
  });
});

describe('applying a promotion batch', () => {
  it('refuses a second application', async () => {
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, jss2, admin, [
      { student: student._id, status: 'Promoted', promotedTo: jss2._id },
    ]);

    await promotionService.applyPromotions(batch._id, admin._id);

    // A year on, the same student has moved again.
    await User.updateOne(
      { _id: student._id },
      { 'studentProfile.class': jss1._id },
    );

    await expect(
      promotionService.applyPromotions(batch._id, admin._id),
    ).rejects.toMatchObject({ statusCode: 409 });

    const after = await User.findById(student._id);
    expect(String(after.studentProfile.class)).toBe(String(jss1._id));
  });

  it('only lets one of two simultaneous applications through', async () => {
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, jss2, admin, [
      { student: student._id, status: 'Promoted', promotedTo: jss2._id },
    ]);

    const outcomes = await Promise.allSettled([
      promotionService.applyPromotions(batch._id, admin._id),
      promotionService.applyPromotions(batch._id, admin._id),
    ]);

    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
  });

  it('refuses a manual override once applied', async () => {
    const student = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, jss2, admin, [
      { student: student._id, status: 'Promoted', promotedTo: jss2._id },
    ]);
    await promotionService.applyPromotions(batch._id, admin._id);

    await expect(
      promotionService.updateStudentStatus(
        batch._id,
        String(student._id),
        { status: 'Repeated' },
        admin._id,
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('writes real counts to the audit log', async () => {
    const promoted = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const repeated = await makeUser('Student', {
      studentProfile: { class: jss1._id },
    });
    const batch = await makeBatch(jss1, jss2, admin, [
      { student: promoted._id, status: 'Promoted', promotedTo: jss2._id },
      { student: repeated._id, status: 'Repeated', promotedTo: jss1._id },
    ]);

    const res = await request(app).post(`/promotions/${batch._id}/apply`);
    expect(res.status).toBe(201);

    const entry = await AuditLog.findOne({ action: 'promotion.apply' });
    expect(entry.meta).toMatchObject({ promoted: 1, repeated: 1, total: 2 });
  });

  it('gives tied students the same yearly position', async () => {
    const subject = await Subject.create({ name: 'Maths', code: 'MTH' });
    const make = () =>
      makeUser('Student', { studentProfile: { class: jss1._id } });
    const [a, b, c] = [await make(), await make(), await make()];

    const scores = new Map([
      [a, 80],
      [b, 80],
      [c, 70],
    ]);
    for (const [student, exam] of scores) {
      await Result.create({
        student: student._id,
        class: jss1._id,
        subject: subject._id,
        term: 'First Term',
        academicYear: THIS,
        isPublished: true,
        totalScore: exam,
        grade: 'A',
      });
      await CATracker.create({
        student: student._id,
        subject: subject._id,
        academicYear: THIS,
        termRecords: [],
        yearlyAverage: exam,
      });
    }

    const batch = await Promotion.create({
      academicYear: THIS,
      fromClass: jss1._id,
      toClass: jss2._id,
      createdBy: admin._id,
    });
    const processed = await promotionService.autoProcessPromotion(
      batch._id,
      admin._id,
    );
    const positionOf = (student) =>
      processed.students.find((s) => String(s.student) === String(student._id))
        .yearlyPosition;

    expect([positionOf(a), positionOf(b), positionOf(c)]).toEqual([1, 1, 3]);
  });
});

describe('filling in enrolments for existing students', () => {
  const classId = 'class-a';

  it('adds past sessions from what was filed against the student', () => {
    const missing = missingEnrolments(
      { studentProfile: {} },
      [{ class: classId, academicYear: LAST }],
      THIS,
    );

    expect(missing).toEqual([{ class: classId, academicYear: LAST }]);
  });

  it('skips the session in progress for someone still enrolled', () => {
    expect(
      missingEnrolments(
        { studentProfile: {} },
        [{ class: classId, academicYear: THIS }],
        THIS,
      ),
    ).toEqual([]);
  });

  it('keeps the current session for someone who has left', () => {
    expect(
      missingEnrolments(
        { studentProfile: { profileStatus: 'Graduated' } },
        [{ class: classId, academicYear: THIS }],
        THIS,
      ),
    ).toHaveLength(1);
  });

  it('adds nothing twice', () => {
    expect(
      missingEnrolments(
        {
          studentProfile: {
            enrolments: [{ class: classId, academicYear: LAST }],
          },
        },
        [
          { class: classId, academicYear: LAST },
          { class: classId, academicYear: LAST },
        ],
        THIS,
      ),
    ).toEqual([]);
  });
});
