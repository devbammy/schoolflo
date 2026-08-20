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

module.exports = mongoose.model('Session', SessionSchema);
