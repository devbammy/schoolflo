const AuditLog = require('../models/AuditLog');

/**
 * Writing to the audit log.
 *
 * Two rules govern everything here:
 *
 *   1. An audit failure must never fail the action it was recording. A school
 *      cannot be blocked from publishing results because a log write failed.
 *   2. Nothing sensitive is ever recorded. Passwords, tokens, and gateway
 *      payloads are stripped before anything is written.
 */

// Never written to the log, at any depth.
const REDACTED_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'confirmpassword',
  'token',
  'accesstoken',
  'refreshtoken',
  'tokenhash',
  'passwordresettoken',
  'gatewayresponse',
  'authorization',
  'secret',
  'apikey',
]);

const REDACTED = '[redacted]';

/**
 * Strip anything secret, and keep the structure shallow — an audit entry is a
 * summary, not a copy of the database.
 */
const sanitize = (value, depth = 0) => {
  if (value === null || value === undefined) return value;
  if (depth > 3) return '[truncated]';

  if (Array.isArray(value)) {
    // A long array tells us nothing useful; its length does.
    if (value.length > 20) return `[${value.length} items]`;
    return value.map((item) => sanitize(item, depth + 1));
  }

  if (value instanceof Date) return value;

  if (typeof value === 'object') {
    // ObjectIds and similar stringify usefully; plain objects get walked.
    if (typeof value.toHexString === 'function') return String(value);

    return Object.entries(value).reduce((out, [key, val]) => {
      out[key] = REDACTED_KEYS.has(key.toLowerCase())
        ? REDACTED
        : sanitize(val, depth + 1);
      return out;
    }, {});
  }

  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 500)}…`;
  }

  return value;
};

/**
 * Compare before and after, returning only what actually changed.
 * Recording whole documents would make the log unreadable and would quietly
 * duplicate personal data across the collection.
 */
const diff = (before = {}, after = {}, fields = null) => {
  const keys = fields || [
    ...new Set([...Object.keys(before || {}), ...Object.keys(after || {})]),
  ];

  return keys.reduce((changes, key) => {
    const from = before?.[key];
    const to = after?.[key];

    // Compare by value so ObjectIds and Dates do not read as changed when
    // they are not.
    if (String(from ?? '') === String(to ?? '')) return changes;

    changes[key] = {
      from: REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : sanitize(from),
      to: REDACTED_KEYS.has(key.toLowerCase()) ? REDACTED : sanitize(to),
    };

    return changes;
  }, {});
};

/**
 * Record an action.
 *
 * Awaited by callers so the entry is durable before the response goes out —
 * a single indexed insert into a database we already hold a connection to.
 * Any failure is swallowed and logged; the caller's work stands regardless.
 *
 * @param {object} req      the request, for actor and origin
 * @param {object} entry    { action, entity, entityId, entityLabel, subject,
 *                            changes, meta, outcome, reason }
 */
const record = async (req, entry) => {
  try {
    const actor = req?.user;

    await AuditLog.create({
      actor: actor?._id,
      actorName: actor ? `${actor.firstName} ${actor.lastName}` : undefined,
      actorRole: actor?.role,

      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      entityLabel: entry.entityLabel,
      subject: entry.subject,

      changes: entry.changes ? sanitize(entry.changes) : undefined,
      meta: entry.meta ? sanitize(entry.meta) : undefined,

      ip: req?.ip,
      userAgent: req?.get?.('user-agent')?.slice(0, 300),

      outcome: entry.outcome || 'success',
      reason: entry.reason,
    });
  } catch (error) {
    // Deliberately swallowed. This must never break the action it describes.
    console.error(
      `Audit write failed for '${entry?.action}': ${error.message}`,
    );
  }
};

/**
 * Record an action nobody is signed in for — a failed login, for instance,
 * where there is no req.user to attribute it to.
 */
const recordAnonymous = async (req, entry) =>
  record({ ip: req?.ip, get: req?.get?.bind(req) }, entry);

module.exports = { record, recordAnonymous, diff, sanitize, REDACTED };
