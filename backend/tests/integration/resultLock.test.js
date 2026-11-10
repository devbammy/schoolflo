/**
 * Results held back until fees are paid (services/resultAccessService.js).
 *
 * The school's rule: a term's result is locked for a student or parent while
 * that term's fee, or any earlier fee, has a balance. Part-paid is not paid.
 * Staff always see everything, and an admin may release one student despite
 * a balance. Every route that shows a score is covered here, because a lock on
 * the report card alone is undone by the dashboard, the history page, CA
 * tracking or the results email showing the same numbers.
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
const Subject = require('../../src/models/Subject');
const AuditLog = require('../../src/models/AuditLog');
const { Result } = require('../../src/models/Exam');
const { Fees, Payment } = require('../../src/models/Fees');
const { resetFeatures } = require('../../src/config/features');
const errorHandler = require('../../src/middleware/errorHandler');
const userRoutes = require('../../src/routes/users');
const {
  getReportCard,
  getStudentResultHistory,
  notifyParentsOfResults,
} = require('../../src/controllers/resultController');
const {
  getStudentTracking,
} = require('../../src/controllers/caTrackingController');
const {
  getStudentDashboard,
  getParentDashboard,
} = require('../../src/controllers/dashboardController');

const YEAR = '2025/2026';
const FIRST = 'First Term';
const SECOND = 'Second Term';

let actingUser;

const app = express();
app.use(express.json());
// The release switch goes through the real router, so the Admin-only guard is
// what is tested, with real tokens.
app.use('/users', userRoutes);
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/results/report-card/:studentId', getReportCard);
app.get('/results/student/:studentId/history', getStudentResultHistory);
app.get('/ca/student/:studentId', getStudentTracking);
app.get('/dashboard/student', getStudentDashboard);
app.get('/dashboard/parent', getParentDashboard);
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
let student;
let parent;
let admin;
const fees = {};

const pay = (term, amountPaid) =>
  Payment.create({
    student: student._id,
    feeStructure: fees[term]._id,
    term,
    academicYear: YEAR,
    amountPaid,
    amountDue: amountPaid,
    gateway: 'Cash',
  });

const card = (term, as = student) => {
  actingUser = as;
  return request(app)
    .get(`/results/report-card/${student._id}`)
    .query({ term, academicYear: YEAR });
};

const enable = () => {
  process.env.FEATURE_RESULTS_REQUIRE_FEES = 'true';
  resetFeatures();
};

beforeAll(db.connect);
afterAll(async () => {
  delete process.env.FEATURE_RESULTS_REQUIRE_FEES;
  resetFeatures();
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  enqueueEmail.mockClear();
  enable();

  jss1 = await Class.create({ name: 'JSS 1', level: 'JSS' });
  student = await makeUser('Student', { studentProfile: { class: jss1._id } });
  parent = await makeUser('Parent', {
    parentProfile: { children: [student._id] },
  });
  admin = await makeUser('Admin');
  const maths = await Subject.create({ name: 'Mathematics', code: 'MTH' });

  for (const term of [FIRST, SECOND]) {
    fees[term] = await Fees.create({
      title: `${term} tuition`,
      class: jss1._id,
      term,
      academicYear: YEAR,
      items: [{ label: 'Tuition', amount: 45000 }],
      dueDate: new Date('2030-01-01'),
    });
    await Result.create({
      student: student._id,
      class: jss1._id,
      subject: maths._id,
      term,
      academicYear: YEAR,
      isPublished: true,
      totalScore: 71,
      grade: 'A',
    });
  }
});

describe('the report card', () => {
  it('is open to everyone when the school has not turned the lock on', async () => {
    delete process.env.FEATURE_RESULTS_REQUIRE_FEES;
    resetFeatures();

    expect((await card(FIRST)).status).toBe(200);
  });

  it('is withheld from a student who owes, with the balance', async () => {
    const res = await card(FIRST);

    expect(res.status).toBe(402);
    expect(res.body.errors).toMatchObject({
      reason: 'FEES_OUTSTANDING',
      term: FIRST,
      academicYear: YEAR,
      outstanding: 45000,
    });
    expect(res.body.errors.fees.map((f) => f.term)).toEqual([FIRST]);
  });

  it('is withheld from the parent too', async () => {
    expect((await card(FIRST, parent)).status).toBe(402);
  });

  it('is never withheld from staff', async () => {
    const teacher = await makeUser('Teacher');

    expect((await card(FIRST, admin)).status).toBe(200);
    expect((await card(FIRST, teacher)).status).toBe(200);
  });

  it('stays withheld after a part-payment', async () => {
    await pay(FIRST, 20000);

    const res = await card(FIRST);

    expect(res.status).toBe(402);
    expect(res.body.errors.outstanding).toBe(25000);
  });

  it('opens once that term is paid, without waiting for next term', async () => {
    await pay(FIRST, 45000);

    expect((await card(FIRST)).status).toBe(200);
    expect((await card(SECOND)).status).toBe(402);
  });

  it('stays locked while an older term is unpaid, even if this one is paid', async () => {
    await pay(SECOND, 45000);

    const res = await card(SECOND);

    expect(res.status).toBe(402);
    expect(res.body.errors.outstanding).toBe(45000);
    expect(res.body.errors.fees.map((f) => f.term)).toEqual([FIRST]);
  });

  it('is open where no fee was ever set for the class', async () => {
    await Fees.deleteMany({});

    expect((await card(FIRST)).status).toBe(200);
  });
});

describe('the results history', () => {
  it('lists a locked term without its scores', async () => {
    await pay(FIRST, 45000);
    actingUser = student;

    const res = await request(app).get(
      `/results/student/${student._id}/history`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data.history.map((h) => h.term)).toEqual([FIRST]);
    expect(res.body.data.locked).toEqual([
      expect.objectContaining({
        term: SECOND,
        locked: true,
        outstanding: 45000,
      }),
    ]);
    expect(JSON.stringify(res.body.data.locked)).not.toMatch(/totalScore/);
  });
});

describe('CA tracking', () => {
  it('is withheld while any term in the year that has results is locked', async () => {
    await pay(FIRST, 45000);
    actingUser = parent;

    const res = await request(app)
      .get(`/ca/student/${student._id}`)
      .query({ academicYear: YEAR });

    expect(res.status).toBe(402);
    expect(res.body.errors.term).toBe(SECOND);
  });

  it('opens once the year is paid', async () => {
    await pay(FIRST, 45000);
    await pay(SECOND, 45000);
    actingUser = parent;

    const res = await request(app)
      .get(`/ca/student/${student._id}`)
      .query({ academicYear: YEAR });

    expect(res.status).toBe(200);
  });
});

describe('the dashboards', () => {
  it('show a student no score and no average for a locked term', async () => {
    actingUser = student;

    const res = await request(app)
      .get('/dashboard/student')
      .query({ term: FIRST, academicYear: YEAR });

    expect(res.status).toBe(200);
    expect(res.body.data.recentResults).toEqual([]);
    expect(res.body.data.stats.averageScore).toBeNull();
    expect(res.body.data.resultsLock).toMatchObject({
      locked: true,
      outstanding: 45000,
    });
  });

  it('leave a locked term out of the parent’s latest results', async () => {
    await pay(FIRST, 45000);
    actingUser = parent;

    const res = await request(app)
      .get('/dashboard/parent')
      .query({ term: SECOND, academicYear: YEAR });

    const [entry] = res.body.data.childrenData;
    expect(entry.latestResults.map((r) => r.term)).toEqual([FIRST]);
    expect(entry.resultsLock.locked).toBe(true);
  });
});

describe('the results email', () => {
  it('tells a parent who owes that results are ready, without the scores', async () => {
    await notifyParentsOfResults([student._id], FIRST, YEAR);

    expect(enqueueEmail).toHaveBeenCalledTimes(1);
    const { html } = enqueueEmail.mock.calls[0][0];
    expect(html).toMatch(/paid in full/);
    expect(html).toMatch(/45,000/);
    expect(html).not.toMatch(/Class Position|71/);
  });

  it('sends the usual email, scores included, once fees are paid', async () => {
    await pay(FIRST, 45000);

    await notifyParentsOfResults([student._id], FIRST, YEAR);

    const { html } = enqueueEmail.mock.calls[0][0];
    expect(html).toMatch(/Class Position/);
  });
});

describe('an admin releasing a student despite the balance', () => {
  const release = (body, as = admin) =>
    request(app)
      .put(`/users/${student._id}/results-release`)
      .set('Authorization', `Bearer ${as.generateAccessToken()}`)
      .send(body);

  it('opens every term, and is audited against the student', async () => {
    const res = await release({ release: true, note: 'Scholarship' });

    expect(res.status).toBe(200);
    expect(res.body.data.resultsAccess).toMatchObject({
      released: true,
      note: 'Scholarship',
    });
    expect((await card(FIRST)).status).toBe(200);
    expect((await card(SECOND, parent)).status).toBe(200);

    const entry = await AuditLog.findOne({ action: 'results.release' }).lean();
    expect(String(entry.subject)).toBe(String(student._id));
  });

  it('can be withdrawn, locking the results again', async () => {
    await release({ release: true });
    await release({ release: false });

    expect((await card(FIRST)).status).toBe(402);
    expect(
      await AuditLog.countDocuments({ action: 'results.release_withdrawn' }),
    ).toBe(1);
  });

  it('is for admins only', async () => {
    const teacher = await makeUser('Teacher');

    const res = await release({ release: true }, teacher);

    expect(res.status).toBe(403);
    expect((await card(FIRST)).status).toBe(402);
  });

  it('leaves the rest of the student’s profile alone', async () => {
    await User.updateOne(
      { _id: student._id },
      { 'studentProfile.section': 'A', 'studentProfile.parentId': parent._id },
    );

    await release({ release: true });

    const stored = await User.findById(student._id);
    expect(stored.studentProfile.section).toBe('A');
    expect(String(stored.studentProfile.parentId)).toBe(String(parent._id));
    expect(String(stored.studentProfile.class)).toBe(String(jss1._id));
  });
});
