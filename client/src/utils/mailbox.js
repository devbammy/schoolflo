/**
 * A student with no email of their own has a placeholder address on the
 * server that can never receive mail (backend utils/mailbox.js). It is an
 * implementation detail, so the portal shows nothing in its place rather than
 * "student-65f0…@no-email.invalid".
 */
const NO_MAILBOX = /@no-email\.invalid$/i;

export const hasMailbox = (email) => Boolean(email) && !NO_MAILBOX.test(email);

export const shownEmail = (email) => (hasMailbox(email) ? email : '');
