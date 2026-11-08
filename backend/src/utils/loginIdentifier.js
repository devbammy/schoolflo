/**
 * What a person types in the sign-in box: an email, or a student's admission
 * number. Anything with an "@" is an email; anything else is an admission
 * number.
 *
 * Admission numbers are generated upper case with no spaces (User pre('save')),
 * but they are read off a slip and typed on a phone, which capitalises the
 * first letter and inserts spaces after autocorrect. Normalising here is what
 * lets "ao 260012" sign in as AO260012.
 *
 * The login rate limiter keys on the same normalised value. If it did not,
 * each spelling of one admission number would get its own budget of attempts,
 * the same trap NORMALIZE_EMAIL_OPTIONS exists to close for addresses.
 */

const ADMISSION_NUMBER_SHAPE = /^[A-Z0-9][A-Z0-9/-]{2,31}$/;

const isEmailIdentifier = (value) => String(value || '').includes('@');

const normalizeAdmissionNumber = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();

/**
 * An address reduced as `.normalizeEmail(NORMALIZE_EMAIL_OPTIONS)` reduces it
 * when an account is created: lower case, and googlemail.com is gmail.com.
 * Nothing else, since those options keep dots and +tags. Written out rather than
 * imported because validator.js is express-validator's dependency, not ours,
 * and pnpm will not resolve it from here. tests/unit/loginIdentifier.test.js
 * holds the two to the same answer.
 */
const normalizeEmailIdentifier = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/@googlemail\.com$/, '@gmail.com');

// Loose on purpose, like the model's: whether an address works is decided by
// whether mail arrives, not by a regex.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The identifier from a login body. `email` is the field older clients send. */
const rawLoginIdentifier = (body = {}) => body.identifier ?? body.email ?? '';

module.exports = {
  ADMISSION_NUMBER_SHAPE,
  EMAIL_SHAPE,
  normalizeEmailIdentifier,
  isEmailIdentifier,
  normalizeAdmissionNumber,
  rawLoginIdentifier,
};
