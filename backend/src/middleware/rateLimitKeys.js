const jwt = require('jsonwebtoken');
const {
  isEmailIdentifier,
  normalizeAdmissionNumber,
  normalizeEmailIdentifier,
  rawLoginIdentifier,
} = require('../utils/loginIdentifier');

/**
 * What a rate limit should count.
 *
 * The limiter used to key on IP alone, which is wrong for the deployment this
 * product actually has. A Nigerian secondary school puts its whole staff room
 * behind one connection, so every teacher, the bursar and the principal shared
 * a single 200-request budget — and a single 20-login budget. Measured on a
 * running server, the twelfth person to sign in was refused. On a Monday
 * morning that is the school locked out of its own portal.
 *
 * So: count per ACCOUNT wherever an account is known, and fall back to IP only
 * for traffic that has not identified itself.
 */

/**
 * IPv6 addresses are handed out a /64 per device, so keying on the full
 * address lets one host cycle through billions of distinct keys. Collapse to
 * the /64 prefix, which is the unit an ISP actually allocates.
 */
const normalizeIp = (ip = '') => {
  const address = String(ip).replace(/^::ffff:/, ''); // IPv4-mapped IPv6

  if (!address.includes(':')) return address; // plain IPv4

  const groups = address.split(':');
  return `${groups.slice(0, 4).join(':')}::/64`;
};

/**
 * The signed-in user's id, or null.
 *
 * The limiter runs before `protect`, so there is no `req.user` yet. The token
 * is verified rather than merely decoded — an unverified `sub` would let
 * anyone spend someone else's allowance by forging a payload.
 */
const userIdFromToken = (req) => {
  const header = req.headers?.authorization || '';
  if (!header.startsWith('Bearer ')) return null;

  try {
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    return decoded?.id ? String(decoded.id) : null;
  } catch {
    return null; // expired or forged — it will be refused downstream anyway
  }
};

/** Per account when signed in, per IP otherwise. */
const byUserOrIp = (req) => {
  const userId = userIdFromToken(req);
  return userId ? `u:${userId}` : `ip:${normalizeIp(req.ip)}`;
};

/**
 * For login: per account being *attempted*, not per person attempting.
 *
 * Brute force is an attack on one account, so that is what the budget should
 * protect. Keying on IP instead punished the school for having many staff,
 * while doing nothing extra against an attacker with a list of addresses.
 */
const byLoginTarget = (req) => {
  // The limiter runs before the route's validator, so it sees the address as
  // typed. It must reduce it exactly as the validator will (see
  // NORMALIZE_EMAIL_OPTIONS), or one account can be attacked under many
  // spellings, each with its own budget.
  const typed = String(rawLoginIdentifier(req.body) || '').trim();

  // A student signing in with an admission number, reduced exactly as the
  // login validator reduces it, for the same reason as the address below.
  if (typed && !isEmailIdentifier(typed)) {
    return `login:adm:${normalizeAdmissionNumber(typed)}`;
  }

  const email = normalizeEmailIdentifier(typed);

  return email ? `login:${email}` : `login-ip:${normalizeIp(req.ip)}`;
};

/**
 * A loose per-host ceiling, so one machine cannot walk a list of addresses
 * unchecked now that the main login budget is per account. Set high enough
 * that a whole staff room signing in never reaches it.
 */
const byIp = (req) => `ip:${normalizeIp(req.ip)}`;

module.exports = {
  byUserOrIp,
  byLoginTarget,
  byIp,
  normalizeIp,
  userIdFromToken,
};
