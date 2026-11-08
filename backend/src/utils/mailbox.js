/**
 * Students who have no email address of their own.
 *
 * Most pupils in a Nigerian primary or junior secondary school have no email,
 * and the registration sheets schools keep put the parent's address in the
 * student column instead. Imported as it was, the student and the parent
 * fought over one address: two-thirds of one school's roll failed to import.
 *
 * Such a student signs in with their admission number and a password the admin
 * hands them on a printed slip. Their account still carries an address, because
 * `User.email` is required and unique and the production index is built that
 * way, but it is one that can never receive mail: `.invalid` is reserved by
 * RFC 2606 and will never resolve. It is made from the document id, so it is
 * unique without a counter.
 *
 * Everything that sends mail asks `hasMailbox` first, so a welcome email or an
 * announcement is skipped for these accounts rather than queued, retried and
 * logged as a failure five times over.
 */

const NO_MAILBOX_DOMAIN = 'no-email.invalid';

const placeholderEmail = (id) => `student-${id}@${NO_MAILBOX_DOMAIN}`;

const hasMailbox = (email) =>
  Boolean(email) &&
  !String(email).toLowerCase().endsWith(`@${NO_MAILBOX_DOMAIN}`);

/** The address to show a person, or null when there is none to show. */
const shownEmail = (email) => (hasMailbox(email) ? email : null);

/**
 * A search condition on email that never matches a placeholder. Without it,
 * searching for "student" or "invalid" listed every pupil with no address.
 */
const PLACEHOLDER_PATTERN = /@no-email\.invalid$/i;

const emailMatches = (pattern) => ({
  $and: [{ email: pattern }, { email: { $not: PLACEHOLDER_PATTERN } }],
});

module.exports = {
  NO_MAILBOX_DOMAIN,
  placeholderEmail,
  hasMailbox,
  shownEmail,
  emailMatches,
};
