/**
 * Escape a user's text for use inside a RegExp, so it matches as typed.
 *
 * Without it, regex metacharacters in a search box or filter are interpreted:
 * "." matches everything, and a crafted pattern can scan a whole collection.
 * Several controllers still carry a local copy of this one line; new code
 * should require this one.
 */
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = escapeRegex;
