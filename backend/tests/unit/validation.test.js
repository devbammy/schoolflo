const express = require('express');
const request = require('supertest');
require('express-async-errors');

const validate = require('../../src/middleware/validate');
const errorHandler = require('../../src/middleware/errorHandler');
const AppError = require('../../src/utils/AppError');
const ms = require('../../src/utils/ms');
const {
  validateScores,
  validateScoreBatch,
} = require('../../src/utils/scoreValidation');
const { loginRules } = require('../../src/validators/authValidators');
const {
  initPaymentRules,
  manualPaymentRules,
} = require('../../src/validators/paymentValidators');
const { bulkResultRules } = require('../../src/validators/resultValidators');

const OID = '507f1f77bcf86cd799439011';

/** Build a throwaway app exposing one validated route. */
const appWith = (rules) => {
  const app = express();
  app.use(express.json());
  app.post('/', validate(rules), (req, res) =>
    res.json({ ok: true, body: req.body }),
  );
  app.use(errorHandler);
  return app;
};

describe('validateScores', () => {
  it('accepts full marks in every component', () => {
    const scores = { ca1: 10, ca2: 10, classWork: 10, project: 10, exam: 60 };
    const result = validateScores(scores);
    expect(result.valid).toBe(true);
    expect(result.scores).toEqual(scores);
  });

  it.each([
    ['ca1', 11, '1st CA cannot exceed 10.'],
    ['ca2', 11, '2nd CA cannot exceed 10.'],
    ['classWork', 11, 'Class Work cannot exceed 10.'],
    ['project', 11, 'Project cannot exceed 10.'],
    ['exam', 61, 'Exam cannot exceed 60.'],
  ])('rejects %s above its cap', (field, value, message) => {
    const result = validateScores({ [field]: value });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(message);
  });

  it('rejects negative scores', () => {
    // A negative exam score would drag down the whole class average.
    expect(validateScores({ exam: -60 }).valid).toBe(false);
  });

  it('rejects non-numeric input', () => {
    expect(validateScores({ ca1: 'abc' }).valid).toBe(false);
  });

  it('treats a missing component as zero', () => {
    expect(validateScores({}).scores).toEqual({
      ca1: 0,
      ca2: 0,
      classWork: 0,
      project: 0,
      exam: 0,
    });
  });

  it('coerces numeric strings from form input', () => {
    expect(validateScores({ ca1: '8' }).scores.ca1).toBe(8);
  });

  it('reports every problem at once, not just the first', () => {
    const result = validateScores({ ca1: 11, ca2: -1, exam: 99 });
    expect(result.errors).toHaveLength(3);
  });
});

describe('validateScoreBatch', () => {
  it('rejects the whole batch if any row is invalid', () => {
    // A half-applied set of scores is worse than none — the teacher cannot
    // tell which rows landed.
    const batch = validateScoreBatch(
      [
        { student: 'a', scores: { ca1: 9 } },
        { student: 'b', scores: { ca1: 99 } },
      ],
      (row) => `Student ${row.student}`,
    );

    expect(batch.valid).toBe(false);
    expect(batch.errors).toContain('Student b: 1st CA cannot exceed 10.');
  });

  it('labels each failing row so the teacher knows which to fix', () => {
    const batch = validateScoreBatch(
      [
        { student: 'a', scores: { ca1: 99 } },
        { student: 'b', scores: { exam: -3 } },
      ],
      (row) => `Student ${row.student}`,
    );

    expect(batch.errors).toEqual([
      'Student a: 1st CA cannot exceed 10.',
      'Student b: Exam cannot be negative.',
    ]);
  });

  it('passes normalised rows through when everything is valid', () => {
    const batch = validateScoreBatch([{ student: 'a', scores: { ca1: 9 } }]);
    expect(batch.valid).toBe(true);
    expect(batch.rows[0].scores).toEqual({
      ca1: 9,
      ca2: 0,
      classWork: 0,
      project: 0,
      exam: 0,
    });
  });
});

describe('request validation middleware', () => {
  it('rejects a login with no credentials, naming both fields', async () => {
    const res = await request(appWith(loginRules)).post('/').send({});
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
  });

  it('rejects a malformed email', async () => {
    const res = await request(appWith(loginRules))
      .post('/')
      .send({ email: 'not-an-email', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('rejects non-ObjectId ids on payment init', async () => {
    const res = await request(appWith(initPaymentRules))
      .post('/')
      .send({ studentId: 'abc', feeStructureId: 'def' });
    expect(res.status).toBe(400);
    expect(res.body.errors).toHaveLength(2);
  });

  it('allows payment init with no amount — the server computes it', async () => {
    const res = await request(appWith(initPaymentRules))
      .post('/')
      .send({ studentId: OID, feeStructureId: OID });
    expect(res.status).toBe(200);
  });

  it('rejects a negative payment amount', async () => {
    const res = await request(appWith(initPaymentRules))
      .post('/')
      .send({ studentId: OID, feeStructureId: OID, amount: -500 });
    expect(res.status).toBe(400);
  });

  it('restricts manual payments to cash and bank transfer', async () => {
    // A cash entry must not be recorded against a card gateway.
    const res = await request(appWith(manualPaymentRules)).post('/').send({
      studentId: OID,
      feeStructureId: OID,
      amountPaid: 5000,
      gateway: 'Paystack',
    });
    expect(res.status).toBe(400);
  });

  it('rejects a zero manual payment', async () => {
    const res = await request(appWith(manualPaymentRules))
      .post('/')
      .send({ studentId: OID, feeStructureId: OID, amountPaid: 0 });
    expect(res.status).toBe(400);
  });

  it('rejects an over-cap score at the request edge', async () => {
    const res = await request(appWith(bulkResultRules))
      .post('/')
      .send({
        class: OID,
        subject: OID,
        term: 'First Term',
        academicYear: '2024/2025',
        results: [{ student: OID, scores: { ca1: 99 } }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1st CA/);
  });

  it('rejects an invalid term', async () => {
    const res = await request(appWith(bulkResultRules))
      .post('/')
      .send({
        class: OID,
        subject: OID,
        term: 'Term One',
        academicYear: '2024/2025',
        results: [{ student: OID, scores: { ca1: 5 } }],
      });
    expect(res.status).toBe(400);
  });

  it('rejects a malformed academic year', async () => {
    const res = await request(appWith(bulkResultRules))
      .post('/')
      .send({
        class: OID,
        subject: OID,
        term: 'First Term',
        academicYear: '2024-2025',
        results: [{ student: OID, scores: { ca1: 5 } }],
      });
    expect(res.status).toBe(400);
  });
});

describe('error handler', () => {
  const appThrowing = (thrower) => {
    const app = express();
    app.get('/', thrower);
    app.use(errorHandler);
    return app;
  };

  const withEnv = async (env, fn) => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = previous;
    }
  };

  it('never leaks internal details for an unexpected fault', async () => {
    await withEnv('production', async () => {
      const app = appThrowing(() => {
        throw new Error('connect ECONNREFUSED mongodb://user:pass@10.0.0.1');
      });

      const res = await request(app).get('/');

      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/mongodb|ECONNREFUSED|pass/);
      expect(res.body.stack).toBeUndefined();
    });
  });

  it('reports an AppError with its own status and message', async () => {
    const app = appThrowing(() => {
      throw AppError.notFound('Student not found');
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Student not found');
  });

  it('maps a duplicate key to 409 and names the field', async () => {
    const app = appThrowing(() => {
      const err = new Error('E11000');
      err.code = 11000;
      err.keyValue = { email: 'ada@school.ng' };
      throw err;
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/email/);
  });

  it('maps a bad ObjectId to 400, not 404', async () => {
    const app = appThrowing(() => {
      const err = new Error('Cast failed');
      err.name = 'CastError';
      err.value = 'not-an-id';
      err.path = 'id';
      throw err;
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(400);
  });

  it('maps an expired token to 401', async () => {
    const app = appThrowing(() => {
      const err = new Error('jwt expired');
      err.name = 'TokenExpiredError';
      throw err;
    });

    const res = await request(app).get('/');
    expect(res.status).toBe(401);
  });
});

describe('ms', () => {
  it.each([
    ['15m', 900000],
    ['1h', 3600000],
    ['30d', 2592000000],
    ['45s', 45000],
    ['60', 60000], // bare numbers are seconds, matching jsonwebtoken
  ])('parses %s', (input, expected) => {
    expect(ms(input)).toBe(expected);
  });

  it('falls back rather than throwing on nonsense', () => {
    expect(ms('not-a-duration')).toBe(30 * 86400000);
    expect(ms(undefined)).toBe(30 * 86400000);
  });

  it('passes a number straight through', () => {
    expect(ms(5000)).toBe(5000);
  });
});
