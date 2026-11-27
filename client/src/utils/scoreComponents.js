/**
 * The five components of a subject result, mirroring the backend's
 * SCORE_BREAKDOWN in backend/src/config/constants.js.
 *
 * 1st CA 10 + 2nd CA 10 + Class Work 10 + Project 10 + Exam 60 = 100.
 *
 * Every grade-entry grid and results table reads its columns, caps and totals
 * from here, so a change to the school's weighting only lands in two places:
 * this file and the backend constant it mirrors.
 */
export const SCORE_COMPONENTS = [
  { key: 'ca1', label: '1st CA', max: 10 },
  { key: 'ca2', label: '2nd CA', max: 10 },
  { key: 'classWork', label: 'Class Work', max: 10 },
  { key: 'project', label: 'Project', max: 10 },
  { key: 'exam', label: 'Exam', max: 60 },
];

/** Continuous-assessment components — everything except the exam. */
export const CA_COMPONENTS = SCORE_COMPONENTS.filter((c) => c.key !== 'exam');

export const SCORE_CAPS = Object.fromEntries(
  SCORE_COMPONENTS.map(({ key, max }) => [key, max]),
);

export const CA_MAX = CA_COMPONENTS.reduce((sum, c) => sum + c.max, 0);

export const EMPTY_SCORES = Object.fromEntries(
  SCORE_COMPONENTS.map(({ key }) => [key, 0]),
);

/** Sum of the continuous-assessment components of one result. */
export const caTotal = (scores = {}) =>
  CA_COMPONENTS.reduce((sum, { key }) => sum + (scores?.[key] || 0), 0);

/**
 * Sum of every component — the score the grade is read from. Rounded to two
 * places: scores carry decimals (a project of 7.30), and binary floating point
 * turns 9 + 7 + 5.3 + 7.3 + 54 into 82.60000000000001.
 */
export const scoreTotal = (scores = {}) =>
  Math.round(
    SCORE_COMPONENTS.reduce((sum, { key }) => sum + (scores?.[key] || 0), 0) *
      100,
  ) / 100;
