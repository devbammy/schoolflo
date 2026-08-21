const mongoose = require('mongoose');

/**
 * An immutable record of a sensitive action.
 *
 * The question this exists to answer is "who changed this score, and when" —
 * and its financial equivalent. Without it, a disputed result or a missing
 * payment is a matter of opinion.
 *
 * Records are append-only. Nothing in the application updates or deletes them;
 * there is no route that can.
 */
const AuditLogSchema = new mongoose.Schema(
  {
    // Who. Kept as a snapshot as well as a reference, so the log still reads
    // correctly after the account is renamed or deleted.
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    actorName: String,
    actorRole: String,

    // What. A stable dot-separated verb, e.g. 'result.publish'.
    action: {
      type: String,
      required: true,
      index: true,
    },

    // Which record it happened to.
    entity: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    entityLabel: String, // human-readable, e.g. a student's name

    // The student the action concerns, when that differs from the entity —
    // this is what makes "everything that happened to this child" answerable.
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },

    // Only the fields that actually changed, never whole documents.
    changes: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },

    // Anything else worth keeping: amounts, counts, reasons.
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined,
    },

    // Where from.
    ip: String,
    userAgent: String,

    // Did it succeed? Failed sensitive attempts matter as much as successful
    // ones — a run of failed logins is the signal you want to keep.
    outcome: {
      type: String,
      enum: ['success', 'failure'],
      default: 'success',
      index: true,
    },
    reason: String,
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    // An audit entry that can be edited is not an audit entry.
    strict: true,
  },
);

// The three ways this log actually gets read: a record's history, a person's
// activity, and "what happened recently".
AuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
AuditLogSchema.index({ actor: 1, createdAt: -1 });
AuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
