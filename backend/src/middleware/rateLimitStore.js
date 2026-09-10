const mongoose = require('mongoose');

/**
 * A rate-limit store backed by the MongoDB the app is already connected to.
 *
 * `express-rate-limit` defaults to an in-process Map. That is a per-instance
 * limit dressed up as a global one: run two dynos behind a load balancer and
 * the effective allowance doubles, and it resets to zero every deploy. The
 * login limiter is the one that matters — 20 attempts per window is not a
 * brute-force defence if an attacker gets 20 per instance and a fresh 20 after
 * every restart.
 *
 * Redis would be the conventional answer. This uses Mongo instead because the
 * app already has a connection to it, and adding an entire piece of
 * infrastructure to count requests is a poor trade for a school portal.
 *
 * Counters are disposable by design. If Mongo is unreachable the limiter fails
 * OPEN — a database blip must not lock every user out of the portal, and the
 * request is about to fail on its own anyway if it needs the database.
 */
class MongoRateLimitStore {
  constructor({ prefix = 'rl', collectionName = 'ratelimits' } = {}) {
    this.prefix = prefix;
    this.collectionName = collectionName;
    this.windowMs = 60 * 1000;
    this.indexReady = null;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  get collection() {
    if (mongoose.connection.readyState !== 1) return null;
    return mongoose.connection.collection(this.collectionName);
  }

  /**
   * A TTL index sweeps expired counters. Created lazily and once: doing it at
   * require time would race the database connection.
   */
  async ensureIndex(collection) {
    if (!this.indexReady) {
      this.indexReady = collection
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
        .catch(() => {
          // A missing TTL index costs disk, not correctness. Reset so a later
          // call can retry rather than being stuck with a rejected promise.
          this.indexReady = null;
        });
    }
    return this.indexReady;
  }

  key(key) {
    return `${this.prefix}:${key}`;
  }

  async increment(key) {
    const collection = this.collection;
    const now = new Date();
    const resetTime = new Date(now.getTime() + this.windowMs);

    if (!collection) return { totalHits: 1, resetTime };

    try {
      await this.ensureIndex(collection);

      // Bump a window that is still open. Matching on expiresAt rather than
      // reading-then-writing keeps two concurrent requests from each deciding
      // they are the first hit of a new window.
      const live = await collection.findOneAndUpdate(
        { _id: this.key(key), expiresAt: { $gt: now } },
        { $inc: { hits: 1 } },
        { returnDocument: 'after' },
      );

      const bumped = live?.value ?? live;
      if (bumped) {
        return { totalHits: bumped.hits, resetTime: bumped.expiresAt };
      }

      // No live window: start one. Two racing requests can both land here and
      // one hit is lost, which only ever happens on a window boundary and only
      // ever in the caller's favour.
      const started = await collection.findOneAndUpdate(
        { _id: this.key(key) },
        { $set: { hits: 1, expiresAt: resetTime } },
        { upsert: true, returnDocument: 'after' },
      );

      const doc = started?.value ?? started;
      return {
        totalHits: doc?.hits ?? 1,
        resetTime: doc?.expiresAt ?? resetTime,
      };
    } catch (error) {
      console.error(`Rate limit store unavailable: ${error.message}`);
      return { totalHits: 1, resetTime };
    }
  }

  async decrement(key) {
    const collection = this.collection;
    if (!collection) return;

    try {
      await collection.updateOne(
        { _id: this.key(key), hits: { $gt: 0 } },
        { $inc: { hits: -1 } },
      );
    } catch {
      // A counter that failed to come back down expires on its own.
    }
  }

  async resetKey(key) {
    const collection = this.collection;
    if (!collection) return;

    try {
      await collection.deleteOne({ _id: this.key(key) });
    } catch {
      // Same as above: the TTL index is the backstop.
    }
  }

  async resetAll() {
    const collection = this.collection;
    if (!collection) return;

    try {
      await collection.deleteMany({
        _id: { $regex: `^${this.prefix}:` },
      });
    } catch {
      // Nothing to do — counters are disposable.
    }
  }
}

module.exports = MongoRateLimitStore;
