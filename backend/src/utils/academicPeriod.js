const AcademicCalendar = require('../models/AcademicCalendar');

/**
 * Which term and session "today" falls in.
 *
 * Everything that records a dated event — attendance above all — has to stamp
 * a term and an academic year onto it. Leaving that to the client meant the
 * attendance page shipped with `First Term` / `2024/2025` hard-coded, so a
 * register marked in the third term of 2025/2026 was filed under the wrong
 * session and never showed up in the student's summary.
 *
 * The active academic calendar is the authority. The date-derived fallback
 * only exists so a school that has not set one up yet can still mark a
 * register; it assumes a September session start, which is the Nigerian norm.
 */

const SESSION_START_MONTH = 8; // September, zero-indexed

const academicYearFor = (date) => {
  const year = date.getFullYear();
  const startYear = date.getMonth() >= SESSION_START_MONTH ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
};

// Rough term boundaries by month, used only when no calendar is active.
const termFor = (date) => {
  const month = date.getMonth();
  if (month >= 8 || month === 0) return 'First Term';
  if (month >= 1 && month <= 3) return 'Second Term';
  return 'Third Term';
};

/**
 * @param {Date} [on] the date to resolve for, defaulting to now
 * @returns {Promise<{term: string, academicYear: string, source: string}>}
 */
const getCurrentPeriod = async (on = new Date()) => {
  const calendar = await AcademicCalendar.findOne({ isActive: true }).select(
    'academicYear terms',
  );

  if (calendar) {
    const term = (calendar.terms || []).find(
      (t) => on >= new Date(t.startDate) && on <= new Date(t.endDate),
    );

    if (term) {
      return {
        term: term.name,
        academicYear: calendar.academicYear,
        source: 'calendar',
      };
    }

    // Between terms (a holiday): the session is still known, the term is not,
    // so fall back to the nearest term by start date rather than guessing.
    const nearest = [...(calendar.terms || [])].sort(
      (a, b) =>
        Math.abs(new Date(a.startDate) - on) -
        Math.abs(new Date(b.startDate) - on),
    )[0];

    if (nearest) {
      return {
        term: nearest.name,
        academicYear: calendar.academicYear,
        source: 'calendar-nearest',
      };
    }
  }

  return {
    term: termFor(on),
    academicYear: academicYearFor(on),
    source: 'derived',
  };
};

module.exports = { getCurrentPeriod, academicYearFor, termFor };
