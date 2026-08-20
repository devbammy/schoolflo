const UNITS = {
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
};

/**
 * Convert a JWT-style duration ("15m", "1h", "30d") to milliseconds, so a
 * session's stored expiry matches the lifetime baked into the token itself.
 *
 * Falls back to 30 days for anything unparseable rather than throwing at
 * login time over a malformed environment variable.
 */
const ms = (value, fallback = 30 * UNITS.d) => {
  if (typeof value === 'number') return value;

  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(String(value || '').trim());
  if (!match) return fallback;

  const amount = parseInt(match[1], 10);
  const unit = match[2] || 's'; // bare numbers are seconds, as in jsonwebtoken

  return amount * UNITS[unit];
};

module.exports = ms;
