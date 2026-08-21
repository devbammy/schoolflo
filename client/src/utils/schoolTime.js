/**
 * Rendering the school's wall clock, mirroring backend/src/utils/schoolTime.js.
 *
 * Attendance times must read the same on every screen. A teacher checking the
 * roster from a phone still set to another timezone — or a laptop whose clock
 * drifted — must see the time the school recorded, not the time their device
 * would have called it. So instants are formatted against the school's own
 * offset, which the API sends alongside every clock payload, rather than
 * through `toLocaleTimeString`.
 */

// Falls back to WAT (UTC+1) for the moment before the first response lands.
export const DEFAULT_UTC_OFFSET_MINUTES = 60;

const shift = (instant, offsetMinutes) =>
  new Date(new Date(instant).getTime() + offsetMinutes * 60 * 1000);

/** An instant as school-local 'HH:mm'. Returns '—' for a missing time. */
export const formatSchoolTime = (
  instant,
  offsetMinutes = DEFAULT_UTC_OFFSET_MINUTES,
) => {
  if (!instant) return '—';

  const local = shift(instant, offsetMinutes);

  return `${String(local.getUTCHours()).padStart(2, '0')}:${String(
    local.getUTCMinutes(),
  ).padStart(2, '0')}`;
};

/**
 * A day key ('2026-08-21') for a date, in school-local terms.
 *
 * Used for the date inputs, which speak calendar days rather than instants.
 */
export const toDayKey = (
  instant = new Date(),
  offsetMinutes = DEFAULT_UTC_OFFSET_MINUTES,
) => shift(instant, offsetMinutes).toISOString().slice(0, 10);

/** A day key `days` before today, for the range filters' presets. */
export const dayKeyAgo = (days, offsetMinutes = DEFAULT_UTC_OFFSET_MINUTES) =>
  toDayKey(new Date(Date.now() - days * 86400000), offsetMinutes);

/**
 * A day key rendered for reading — '21 Aug 2026'.
 *
 * Parsed as UTC deliberately: a day key is a label for a calendar day, and
 * running it through the device's timezone would shift it by a day for anyone
 * west of Greenwich.
 */
export const formatDayKey = (key) => {
  if (!key) return '—';

  const date = new Date(
    typeof key === 'string' && key.length === 10 ? `${key}T00:00:00Z` : key,
  );

  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
};

/** Minutes as '7h 30m', or '—' when nothing was recorded. */
export const formatDuration = (minutes) => {
  if (!minutes) return '—';

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  return hours ? `${hours}h ${mins}m` : `${mins}m`;
};
