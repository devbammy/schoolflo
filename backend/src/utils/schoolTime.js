const { STAFF_ATTENDANCE } = require('../config/constants');

/**
 * The school's wall clock.
 *
 * Every question staff attendance asks — "which day is this?", "is 08:12
 * late?", "how long was the working day?" — is a question about local time,
 * not about UTC. The server runs in UTC in production and in whatever the
 * developer's laptop is set to locally, so neither the host clock nor
 * `Date#getHours()` can be trusted to answer them.
 *
 * The trick used throughout: shift an instant by the school's offset and then
 * read its *UTC* fields. Those fields now spell out the local wall clock, and
 * the reading is identical on every machine.
 */

const OFFSET_MS = STAFF_ATTENDANCE.TIMEZONE_OFFSET_MINUTES * 60 * 1000;

const MINUTES_PER_DAY = 24 * 60;

/** An instant, shifted so its UTC fields read as school-local wall time. */
const toLocalFields = (instant) => new Date(instant.getTime() + OFFSET_MS);

/**
 * The calendar day an instant falls on locally, stored as UTC midnight of
 * that day.
 *
 * This is the key every record is filed under. It is a *label for a day*, not
 * an instant — which is why it must never be compared against `new Date()`
 * directly, only against another day key.
 */
const dayKey = (instant = new Date()) => {
  const local = toLocalFields(instant);
  return new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()),
  );
};

/** Minutes since local midnight — 08:12 is 492. */
const minutesIntoDay = (instant) => {
  const local = toLocalFields(instant);
  return local.getUTCHours() * 60 + local.getUTCMinutes();
};

/** "08:30" → 510. Returns null for anything that is not a wall-clock time. */
const parseClockTime = (value) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return hours * 60 + minutes;
};

/** 492 → "08:12". */
const formatClockTime = (minutes) => {
  const safe =
    ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) %
    MINUTES_PER_DAY;
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(
    safe % 60,
  ).padStart(2, '0')}`;
};

/**
 * A day key from a 'YYYY-MM-DD' string.
 *
 * Deliberately not `new Date(value)`: that parses a bare date as UTC
 * midnight, which is a different instant from local midnight and would file
 * an evening record under the previous day near the boundary. Here the parts
 * are read as local calendar fields, which is what the caller meant.
 */
const dayKeyFromDateString = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  const key = new Date(Date.UTC(year, month - 1, day));

  // Rejects 2026-02-31 and friends, which Date would silently roll forward.
  if (
    key.getUTCFullYear() !== year ||
    key.getUTCMonth() !== month - 1 ||
    key.getUTCDate() !== day
  ) {
    return null;
  }

  return key;
};

/** A day key back to 'YYYY-MM-DD'. */
const formatDayKey = (key) => new Date(key).toISOString().slice(0, 10);

/** Today's day key, in school-local terms. */
const today = () => dayKey();

/** Whether a day key falls on a configured working day. */
const isWorkingDay = (key) =>
  STAFF_ATTENDANCE.WORKING_DAYS.includes(new Date(key).getUTCDay());

/** Day keys are UTC midnights, so a whole day is [key, key + 1 day). */
const endOfDayKey = (key) =>
  new Date(new Date(key).getTime() + MINUTES_PER_DAY * 60 * 1000);

module.exports = {
  dayKey,
  today,
  minutesIntoDay,
  parseClockTime,
  formatClockTime,
  dayKeyFromDateString,
  formatDayKey,
  isWorkingDay,
  endOfDayKey,
  toLocalFields,
};
