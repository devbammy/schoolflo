const mongoose = require('mongoose');
const db = require('../setup/db');

const MongoRateLimitStore = require('../../src/middleware/rateLimitStore');

const WINDOW_MS = 60 * 1000;

let store;

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  store = new MongoRateLimitStore({ prefix: 'test' });
  store.init({ windowMs: WINDOW_MS });
});

describe('MongoRateLimitStore', () => {
  it('counts hits across store instances, the way two app instances would', async () => {
    // This is the whole point: an in-memory limiter gives each process its own
    // allowance, so two dynos behind a load balancer silently double it.
    const instanceA = new MongoRateLimitStore({ prefix: 'test' });
    const instanceB = new MongoRateLimitStore({ prefix: 'test' });
    instanceA.init({ windowMs: WINDOW_MS });
    instanceB.init({ windowMs: WINDOW_MS });

    await instanceA.increment('1.2.3.4');
    await instanceB.increment('1.2.3.4');
    const third = await instanceA.increment('1.2.3.4');

    expect(third.totalHits).toBe(3);
  });

  it('keeps separate counters per key', async () => {
    await store.increment('1.2.3.4');
    await store.increment('1.2.3.4');
    const other = await store.increment('5.6.7.8');

    expect(other.totalHits).toBe(1);
  });

  it('keeps separate counters per prefix', async () => {
    const authStore = new MongoRateLimitStore({ prefix: 'auth' });
    authStore.init({ windowMs: WINDOW_MS });

    await store.increment('1.2.3.4');
    await store.increment('1.2.3.4');
    const auth = await authStore.increment('1.2.3.4');

    expect(auth.totalHits).toBe(1);
  });

  it('reports a resetTime one window ahead', async () => {
    const before = Date.now();
    const { resetTime } = await store.increment('1.2.3.4');

    expect(resetTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(resetTime.getTime()).toBeLessThanOrEqual(before + WINDOW_MS + 1000);
  });

  it('holds resetTime steady while a window is open', async () => {
    const first = await store.increment('1.2.3.4');
    const second = await store.increment('1.2.3.4');

    expect(second.resetTime.getTime()).toBe(first.resetTime.getTime());
  });

  it('starts a fresh window once the old one has expired', async () => {
    await store.increment('1.2.3.4');
    await store.increment('1.2.3.4');

    // The TTL index sweeps lazily, so an expired counter can still be on disk
    // when the next request arrives. Expiry has to be decided on read.
    await mongoose.connection
      .collection('ratelimits')
      .updateOne(
        { _id: 'test:1.2.3.4' },
        { $set: { expiresAt: new Date(Date.now() - 1000) } },
      );

    const next = await store.increment('1.2.3.4');

    expect(next.totalHits).toBe(1);
  });

  it('counts concurrent hits without losing any inside an open window', async () => {
    await store.increment('1.2.3.4'); // open the window

    await Promise.all(
      Array.from({ length: 20 }, () => store.increment('1.2.3.4')),
    );

    const final = await store.increment('1.2.3.4');
    expect(final.totalHits).toBe(22);
  });

  it('decrements a counter', async () => {
    await store.increment('1.2.3.4');
    await store.increment('1.2.3.4');
    await store.decrement('1.2.3.4');

    const next = await store.increment('1.2.3.4');
    expect(next.totalHits).toBe(2);
  });

  it('resets one key and leaves the rest alone', async () => {
    await store.increment('1.2.3.4');
    await store.increment('5.6.7.8');

    await store.resetKey('1.2.3.4');

    expect((await store.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await store.increment('5.6.7.8')).totalHits).toBe(2);
  });

  it('resets everything under its own prefix only', async () => {
    const authStore = new MongoRateLimitStore({ prefix: 'auth' });
    authStore.init({ windowMs: WINDOW_MS });

    await store.increment('1.2.3.4');
    await authStore.increment('1.2.3.4');

    await store.resetAll();

    expect((await store.increment('1.2.3.4')).totalHits).toBe(1);
    expect((await authStore.increment('1.2.3.4')).totalHits).toBe(2);
  });

  it('creates the TTL index that sweeps expired counters', async () => {
    await store.increment('1.2.3.4');

    const indexes = await mongoose.connection
      .collection('ratelimits')
      .indexes();

    const ttl = indexes.find((i) => i.expireAfterSeconds !== undefined);
    expect(ttl).toBeTruthy();
    expect(ttl.key).toEqual({ expiresAt: 1 });
  });

  it('fails open when the database is unreachable', async () => {
    // A Mongo blip must degrade the limit, never lock every user out of the
    // portal. The request is about to fail on its own if it needs the DB.
    const offline = new MongoRateLimitStore({ prefix: 'test' });
    offline.init({ windowMs: WINDOW_MS });
    jest.spyOn(offline, 'collection', 'get').mockReturnValue(null);

    const result = await offline.increment('1.2.3.4');

    expect(result.totalHits).toBe(1);
    expect(result.resetTime).toBeInstanceOf(Date);
  });
});
