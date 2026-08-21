const express = require('express');
const request = require('supertest');
require('express-async-errors');

const db = require('../setup/db');

jest.mock('../../src/services/auditService', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  diff: jest.fn(() => ({})),
}));

const User = require('../../src/models/User');
const StaffAttendance = require('../../src/models/StaffAttendance');
const controller = require('../../src/controllers/staffAttendanceController');
const validate = require('../../src/middleware/validate');
const { authorize } = require('../../src/middleware/rbac');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  clockRules,
  markRules,
  updateRules,
  dailyRosterRules,
} = require('../../src/validators/staffAttendanceValidators');

let actingUser;
let admin;
let teacher;
let otherTeacher;

/**
 * The routes with authentication stubbed out. `protect` is exercised
 * elsewhere; what matters here is the clock's own rules — one record per
 * person per day, and an admin's decision outranking a clock-in.
 */
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.get('/staff-attendance/today', controller.getToday);
app.post(
  '/staff-attendance/clock-in',
  validate(clockRules),
  controller.clockIn,
);
app.post(
  '/staff-attendance/clock-out',
  validate(clockRules),
  controller.clockOut,
);
app.get('/staff-attendance/me', controller.getMyAttendance);
app.get(
  '/staff-attendance/daily',
  authorize('Admin'),
  validate(dailyRosterRules),
  controller.getDailyRoster,
);
app.get(
  '/staff-attendance/summary',
  authorize('Admin'),
  controller.getStaffSummary,
);
app.get('/staff-attendance', authorize('Admin'), controller.getAllAttendance);
app.post(
  '/staff-attendance/mark',
  authorize('Admin'),
  validate(markRules),
  controller.markAttendance,
);
app.patch(
  '/staff-attendance/:id',
  authorize('Admin'),
  validate(updateRules),
  controller.updateAttendance,
);
app.use(errorHandler);

const makeUser = (role, firstName, extra = {}) =>
  User.create({
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@school.com`,
    password: 'password123',
    role,
    ...extra,
  });

/**
 * Freeze the wall clock without freezing the event loop — the Mongo driver
 * runs on timers, and faking those would hang every query in the suite.
 *
 * Times are given in UTC; the school runs an hour ahead of it, so 07:05Z is
 * an 08:05 arrival, five minutes after the 08:00 start.
 */
const at = (iso) => {
  jest.useFakeTimers({
    doNotFake: [
      'nextTick',
      'queueMicrotask',
      'setTimeout',
      'clearTimeout',
      'setInterval',
      'clearInterval',
      'setImmediate',
      'clearImmediate',
      'performance',
    ],
  });
  jest.setSystemTime(new Date(iso));
};

const clockIn = (body = {}) =>
  request(app).post('/staff-attendance/clock-in').send(body);

const clockOut = (body = {}) =>
  request(app).post('/staff-attendance/clock-out').send(body);

beforeAll(async () => {
  await db.connect();
  // The one-per-person-per-day rule is a unique index, and an index that was
  // never built cannot enforce anything.
  await StaffAttendance.syncIndexes();
});

afterAll(async () => {
  jest.useRealTimers();
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();

  admin = await makeUser('Admin', 'Ada');
  teacher = await makeUser('Teacher', 'Bola');
  otherTeacher = await makeUser('Teacher', 'Chidi');

  actingUser = teacher;

  // A Monday, 08:05 school time.
  at('2026-08-24T07:05:00Z');
});

afterEach(() => {
  jest.useRealTimers();
});

describe('clocking in', () => {
  it('records the arrival as Present when it falls inside the grace window', async () => {
    const res = await clockIn();

    expect(res.status).toBe(201);
    expect(res.body.data.record.status).toBe('Present');
    expect(res.body.data.record.clockIn.minutesLate).toBe(5);
    expect(res.body.data.canClockIn).toBe(false);
    expect(res.body.data.canClockOut).toBe(true);
  });

  it('records a late arrival as Late once the grace window has passed', async () => {
    at('2026-08-24T07:20:00Z'); // 08:20 — ten minutes past the grace window

    const res = await clockIn();

    expect(res.status).toBe(201);
    expect(res.body.data.record.status).toBe('Late');
    expect(res.body.data.record.clockIn.minutesLate).toBe(20);
    expect(res.body.message).toMatch(/08:20/);
  });

  it('refuses a second clock-in on the same day', async () => {
    await clockIn();

    at('2026-08-24T09:00:00Z');
    const res = await clockIn();

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already clocked in/i);

    expect(await StaffAttendance.countDocuments({ staff: teacher._id })).toBe(
      1,
    );
  });

  it('files a late-evening clock-in under the local day, not the UTC one', async () => {
    // 23:30 UTC on the 24th is 00:30 on the 25th in school time.
    at('2026-08-24T23:30:00Z');

    const res = await clockIn();

    expect(res.status).toBe(201);
    expect(new Date(res.body.data.record.date).toISOString()).toBe(
      '2026-08-25T00:00:00.000Z',
    );
  });

  it('keeps two members of staff on separate records', async () => {
    await clockIn();

    actingUser = otherTeacher;
    const res = await clockIn();

    expect(res.status).toBe(201);
    expect(await StaffAttendance.countDocuments({})).toBe(2);
  });
});

describe('clocking out', () => {
  it('rejects a clock-out from someone who never clocked in', async () => {
    const res = await clockOut();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not clocked in/i);
  });

  it('records the time on site', async () => {
    await clockIn();

    at('2026-08-24T14:35:00Z'); // 15:35 — a seven and a half hour day
    const res = await clockOut({ note: 'Staff meeting ran over' });

    expect(res.status).toBe(200);
    expect(res.body.data.record.workedMinutes).toBe(450);
    expect(res.body.message).toMatch(/7h 30m/);
    expect(res.body.data.canClockOut).toBe(false);
  });

  it('refuses a second clock-out', async () => {
    await clockIn();
    at('2026-08-24T14:35:00Z');
    await clockOut();

    at('2026-08-24T15:00:00Z');
    const res = await clockOut();

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already clocked out/i);
  });
});

describe('the admin roster', () => {
  beforeEach(async () => {
    await clockIn(); // Bola, on time

    actingUser = otherTeacher;
    at('2026-08-24T07:45:00Z'); // Chidi, late
    await clockIn();

    actingUser = admin;
    at('2026-08-24T09:00:00Z');
  });

  it('lists every active staff member, including those who never clocked in', async () => {
    const res = await request(app).get(
      '/staff-attendance/daily?date=2026-08-24',
    );

    expect(res.status).toBe(200);
    expect(res.body.data.roster).toHaveLength(3);

    const byName = Object.fromEntries(
      res.body.data.roster.map((row) => [row.staff.firstName, row]),
    );

    expect(byName.Bola.status).toBe('Present');
    expect(byName.Chidi.status).toBe('Late');

    // The admin never clocked in and nobody accounted for them.
    expect(byName.Ada.status).toBe('Absent');
    expect(byName.Ada.recorded).toBe(false);

    expect(res.body.data.counts).toMatchObject({
      Present: 1,
      Late: 1,
      Absent: 1,
      stillIn: 2,
      unaccounted: 1,
    });
  });

  it('can be narrowed to teachers', async () => {
    const res = await request(app).get(
      '/staff-attendance/daily?date=2026-08-24&role=Teacher',
    );

    expect(res.status).toBe(200);
    expect(res.body.data.roster).toHaveLength(2);
  });

  it('is closed to teachers', async () => {
    actingUser = teacher;

    const res = await request(app).get('/staff-attendance/daily');

    expect(res.status).toBe(403);
  });

  it('rejects a date that is not a real calendar day', async () => {
    const res = await request(app).get(
      '/staff-attendance/daily?date=2026-02-31',
    );

    expect(res.status).toBe(400);
  });
});

describe('admin corrections', () => {
  it('records excused leave and clears any clock times that contradict it', async () => {
    await clockIn();

    actingUser = admin;
    const res = await request(app)
      .post('/staff-attendance/mark')
      .send({
        staff: String(teacher._id),
        status: 'Excused',
        date: '2026-08-24',
        note: 'Approved compassionate leave',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.record.status).toBe('Excused');
    expect(res.body.data.record.clockIn?.at).toBeUndefined();
    expect(res.body.data.record.workedMinutes).toBe(0);
  });

  it('stops a teacher clocking in over a day recorded as leave', async () => {
    actingUser = admin;
    await request(app)
      .post('/staff-attendance/mark')
      .send({
        staff: String(teacher._id),
        status: 'Excused',
        date: '2026-08-24',
        note: 'Approved leave',
      });

    actingUser = teacher;
    const res = await clockIn();

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/excused leave/i);
  });

  it('fills in times for a staff member who forgot the clock', async () => {
    actingUser = admin;

    const res = await request(app)
      .post('/staff-attendance/mark')
      .send({
        staff: String(teacher._id),
        status: 'Present',
        date: '2026-08-24',
        clockInAt: '08:00',
        clockOutAt: '15:30',
        note: 'Phone was flat',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.record.workedMinutes).toBe(450);
    expect(res.body.data.record.source).toBe('admin');
  });

  it('refuses attendance for a future date', async () => {
    actingUser = admin;

    const res = await request(app)
      .post('/staff-attendance/mark')
      .send({
        staff: String(teacher._id),
        status: 'Present',
        date: '2026-09-01',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/future/i);
  });

  it('anchors a corrected time to the record it belongs to, not to today', async () => {
    await clockIn();
    const [record] = await StaffAttendance.find({ staff: teacher._id });

    // Correcting Monday's record on Wednesday.
    at('2026-08-26T09:00:00Z');
    actingUser = admin;

    const res = await request(app)
      .patch(`/staff-attendance/${record._id}`)
      .send({ clockInAt: '07:50', clockOutAt: '16:00', note: 'Gate log' });

    expect(res.status).toBe(200);

    const updated = res.body.data.record;
    expect(new Date(updated.clockIn.at).toISOString()).toBe(
      '2026-08-24T06:50:00.000Z',
    );
    expect(updated.workedMinutes).toBe(490);
    expect(updated.clockIn.minutesLate).toBe(0);
  });

  it('refuses a clock-out that lands before the clock-in', async () => {
    await clockIn();
    const [record] = await StaffAttendance.find({ staff: teacher._id });

    actingUser = admin;
    const res = await request(app)
      .patch(`/staff-attendance/${record._id}`)
      .send({ clockOutAt: '06:00' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/after clock-in/i);
  });
});

describe('summaries', () => {
  it('counts a late day as having turned up', async () => {
    await clockIn(); // Monday, Present

    at('2026-08-25T07:40:00Z'); // Tuesday, Late
    await clockIn();

    actingUser = admin;
    const res = await request(app).get(
      '/staff-attendance/summary?from=2026-08-24&to=2026-08-25',
    );

    expect(res.status).toBe(200);

    const row = res.body.data.summary.find(
      (entry) => entry.staff.firstName === 'Bola',
    );

    expect(row).toMatchObject({ days: 2, present: 1, late: 1, absent: 0 });
    expect(row.attendanceRate).toBe(100);
    expect(row.lateMinutes).toBe(45);
  });

  it('scopes a teacher to their own history', async () => {
    await clockIn();

    actingUser = otherTeacher;
    await clockIn();

    actingUser = teacher;
    const res = await request(app).get('/staff-attendance/me');

    expect(res.status).toBe(200);
    expect(res.body.data.records).toHaveLength(1);
    expect(String(res.body.data.records[0].staff)).toBe(String(teacher._id));
    expect(res.body.data.summary.attended).toBe(1);
  });

  it('closes the full record list to teachers', async () => {
    const res = await request(app).get('/staff-attendance');

    expect(res.status).toBe(403);
  });
});
