const request = require('supertest');
const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../setup/db');

const MongoRateLimitStore = require('../../src/middleware/rateLimitStore');

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
});

const buildApp = (max) => {
  const app = express();
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      max,
      store: new MongoRateLimitStore({ prefix: 'itest' }),
      message: { success: false, message: 'Too many requests' },
    }),
  );
  app.get('/ping', (req, res) => res.json({ ok: true }));
  return app;
};

describe('Rate limiting through express-rate-limit', () => {
  it('allows requests up to the limit and refuses the next one', async () => {
    const app = buildApp(3);

    for (let i = 0; i < 3; i += 1) {
      expect((await request(app).get('/ping')).status).toBe(200);
    }

    const blocked = await request(app).get('/ping');
    expect(blocked.status).toBe(429);
    expect(blocked.body.message).toBe('Too many requests');
  });

  it('shares the count between two app instances', async () => {
    // The regression this guards: an in-process store would give each app its
    // own allowance, so the second instance would happily serve the requests
    // the first had already spent.
    const instanceA = buildApp(3);
    const instanceB = buildApp(3);

    await request(instanceA).get('/ping');
    await request(instanceA).get('/ping');
    await request(instanceB).get('/ping');

    expect((await request(instanceB).get('/ping')).status).toBe(429);
  });

  it('feeds the remaining-requests headers from the shared counter', async () => {
    const app = buildApp(5);

    await request(app).get('/ping');
    const res = await request(app).get('/ping');

    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBe('3');
    // Present only if the store returned a usable resetTime.
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });
});
