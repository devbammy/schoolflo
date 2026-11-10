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

const {
  resolveFeatures,
  getFeatures,
  isEnabled,
  resetFeatures,
  envKey,
  FEATURES,
  PROFILES,
} = require('../../src/config/features');
const requireFeature = require('../../src/middleware/requireFeature');
const errorHandler = require('../../src/middleware/errorHandler');

describe('Feature resolution', () => {
  afterEach(() => {
    delete process.env.SCHOOL_PROFILE;
    delete process.env.FEATURE_ONLINE_PAYMENTS;
    delete process.env.FEATURE_STAFF_ATTENDANCE;
    resetFeatures();
  });

  it('runs the full product when nothing is configured', () => {
    // The default has to be "everything on", or adding a feature would
    // silently withhold it from every existing school.
    expect(resolveFeatures({})).toEqual({
      onlinePayments: true,
      staffAttendance: true,
      // The exception: it withholds results, so a school has to ask for it.
      resultsRequireFees: false,
    });
  });

  it('applies a named profile', () => {
    expect(resolveFeatures({ SCHOOL_PROFILE: 'office-fees' })).toEqual({
      onlinePayments: false,
      staffAttendance: false,
      resultsRequireFees: false,
    });
  });

  it('lets a per-feature env var override the profile', () => {
    const resolved = resolveFeatures({
      SCHOOL_PROFILE: 'office-fees',
      FEATURE_STAFF_ATTENDANCE: 'true',
    });

    expect(resolved.staffAttendance).toBe(true);
    expect(resolved.onlinePayments).toBe(false);
  });

  it('accepts the usual spellings of a boolean', () => {
    ['false', 'FALSE', '0', 'no', 'off'].forEach((value) => {
      expect(
        resolveFeatures({ FEATURE_ONLINE_PAYMENTS: value }).onlinePayments,
      ).toBe(false);
    });

    ['true', 'TRUE', '1', 'yes', 'on'].forEach((value) => {
      expect(
        resolveFeatures({
          SCHOOL_PROFILE: 'office-fees',
          FEATURE_ONLINE_PAYMENTS: value,
        }).onlinePayments,
      ).toBe(true);
    });
  });

  it('ignores an unparseable override rather than guessing', () => {
    expect(
      resolveFeatures({ FEATURE_ONLINE_PAYMENTS: 'maybe' }).onlinePayments,
    ).toBe(true);
  });

  it('throws on an unknown profile instead of shipping the full product', () => {
    // A typo in SCHOOL_PROFILE must not quietly give a school everything.
    expect(() => resolveFeatures({ SCHOOL_PROFILE: 'ofice-fees' })).toThrow(
      /Unknown SCHOOL_PROFILE/,
    );
  });

  it('derives the env var name from the feature name', () => {
    expect(envKey('onlinePayments')).toBe('FEATURE_ONLINE_PAYMENTS');
    expect(envKey('staffAttendance')).toBe('FEATURE_STAFF_ATTENDANCE');
    expect(envKey('resultsRequireFees')).toBe('FEATURE_RESULTS_REQUIRE_FEES');
  });

  it('covers every declared feature in every profile lookup', () => {
    Object.values(PROFILES).forEach((profile) => {
      Object.keys(profile).forEach((key) => {
        // A profile naming a feature that no longer exists would be a
        // silently ignored line of config.
        expect(Object.keys(FEATURES)).toContain(key);
      });
    });
  });

  it('throws when asked about a feature that does not exist', () => {
    expect(() => isEnabled('teleportation')).toThrow(/Unknown feature/);
  });

  it('caches the resolved set until it is reset', () => {
    expect(getFeatures().onlinePayments).toBe(true);

    process.env.SCHOOL_PROFILE = 'office-fees';
    expect(getFeatures().onlinePayments).toBe(true); // still cached

    resetFeatures();
    expect(getFeatures().onlinePayments).toBe(false);
  });
});

describe('requireFeature middleware', () => {
  const buildApp = () => {
    const app = express();
    app.get('/gated', requireFeature('onlinePayments'), (req, res) =>
      res.json({ ok: true }),
    );
    app.use(errorHandler);
    return app;
  };

  afterEach(() => {
    delete process.env.SCHOOL_PROFILE;
    resetFeatures();
  });

  it('passes the request through when the feature is on', async () => {
    resetFeatures();

    expect((await request(buildApp()).get('/gated')).status).toBe(200);
  });

  it('answers 404, not 403, when the feature is off', async () => {
    // A feature this deployment does not have does not exist here. 403 would
    // imply it is a permission the caller might be granted.
    process.env.SCHOOL_PROFILE = 'office-fees';
    resetFeatures();

    const res = await request(buildApp()).get('/gated');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('Payments under the office-fees profile', () => {
  // The point of the whole exercise: turning off online payment must not take
  // the fee ledger with it. Manual payments, balances and the financial
  // report are what a cash-collecting school runs on.
  let app;

  beforeAll(async () => {
    await db.connect();
  });

  afterAll(async () => {
    await db.close();
    delete process.env.SCHOOL_PROFILE;
    resetFeatures();
  });

  beforeEach(async () => {
    await db.clear();
    process.env.SCHOOL_PROFILE = 'office-fees';
    resetFeatures();

    // Required after resetFeatures so the router picks up the new resolution.
    jest.resetModules();
    const paymentRoutes = require('../../src/routes/payments');

    app = express();
    app.use(express.json());
    app.use('/payments', paymentRoutes);
    app.use(errorHandler);
  });

  it('closes the Paystack initialize route', async () => {
    const res = await request(app)
      .post('/payments/initialize/paystack')
      .send({ studentId: 'x', feeStructureId: 'y' });

    expect(res.status).toBe(404);
  });

  it('closes the Paystack verify route', async () => {
    const res = await request(app)
      .post('/payments/verify/paystack')
      .send({ reference: 'SMP-TEST' });

    expect(res.status).toBe(404);
  });

  it('closes the Flutterwave initialize route', async () => {
    const res = await request(app)
      .post('/payments/initialize/flutterwave')
      .send({ studentId: 'x', feeStructureId: 'y' });

    expect(res.status).toBe(404);
  });

  it('leaves the manual payment route reachable', async () => {
    // No auth middleware on this test app, so a 401 from `protect` is the
    // proof the request got past the feature gate to a real handler.
    const res = await request(app).post('/payments/manual').send({});

    expect(res.status).not.toBe(404);
  });

  it('leaves the balance and report routes reachable', async () => {
    expect((await request(app).get('/payments/report')).status).not.toBe(404);
    expect(
      (await request(app).get('/payments/balance/000000000000000000000000'))
        .status,
    ).not.toBe(404);
  });
});
