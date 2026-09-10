const crypto = require('crypto');
const mongoose = require('mongoose');

/**
 * A live refresh token, one row per signed-in device.
 *
 * Refresh tokens were previously bearer-only: valid until they expired, with
 * no way to revoke one. A leaked token was good for its full lifetime and
 * logging out did nothing server side. Recording them here makes logout real,
 * lets a user drop a single device, and gives the account a list of active
 * sessions.
 *
 * Only a SHA-256 hash of the token is stored — a dump of this collection
 * cannot be replayed against the API.
 *
 * Refresh tokens rotate: every use mints a new one and retires the old. The
 * retired hash is kept in `previousTokenHash` for two reasons. It lets a
 * request that raced the rotation — a second browser tab holding the same
 * token, a retry after a dropped response — be answered instead of logging the
 * user out. And once that grace window has passed, a token presented after it
 * was rotated away is a replay: the token leaked, and the whole session is
 * revoked rather than served.
 */
const SessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    tokenHash: {
      type: String,
      required: true,
      unique: true,
    },
    // The hash this session's token had before its most recent rotation.
    previousTokenHash: {
      type: String,
      index: true,
      sparse: true,
    },
    rotatedAt: Date,
    userAgent: String,
    ip: String,
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

// Mongo drops expired sessions on its own; no cleanup job to forget about.
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

SessionSchema.statics.hashToken = function (token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
};

// How long a just-rotated token keeps working. Two tabs share one refresh
// token through localStorage, and both will present it if their access tokens
// expire together; without a grace window the second one would be read as a
// replay and sign the user out of a session they are actively using.
SessionSchema.statics.ROTATION_GRACE_MS = 60 * 1000;

module.exports = mongoose.model('Session', SessionSchema);
