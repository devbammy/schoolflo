const { SCORE_BREAKDOWN } = require('../config/constants');

/**
 * The five components of a result, with the maximum each may carry.
 * Derived from SCORE_BREAKDOWN so the caps live in exactly one place.
 */
const SCORE_COMPONENTS = [
  { key: 'ca1', label: '1st CA', max: SCORE_BREAKDOWN.CA1_MAX },
  { key: 'ca2', label: '2nd CA', max: SCORE_BREAKDOWN.CA2_MAX },
  {
    key: 'classWork',
    label: 'Class Work',
    max: SCORE_BREAKDOWN.CLASS_WORK_MAX,
  },
  { key: 'project', label: 'Project', max: SCORE_BREAKDOWN.PROJECT_MAX },
  { key: 'exam', label: 'Exam', max: SCORE_BREAKDOWN.EXAM_MAX },
];

/**
 * Validate and normalise one student's score entry.
 *
 * Both write paths run through this. The bulk path in particular used to skip
 * validation entirely: bulkWrite does not run Mongoose validators, so the
 * schema's min/max on ScoreBreakdownSchema never fired and a negative or
 * over-cap score would be written straight to the database, then skew every
 * class average and position computed from it.
 *
 * @returns {{ valid: boolean, errors: string[], scores: object }}
 */
const validateScores = (scores = {}, context = '') => {
  const errors = [];
  const clean = {};

  for (const { key, label, max } of SCORE_COMPONENTS) {
    const raw = scores?.[key];

    // Absent means "not yet entered" and scores as zero.
    if (raw === undefined || raw === null || raw === '') {
      clean[key] = 0;
      continue;
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
      errors.push(`${label} must be a number.`);
      continue;
    }

    if (value < 0) {
      errors.push(`${label} cannot be negative.`);
      continue;
    }

    if (value > max) {
      errors.push(`${label} cannot exceed ${max}.`);
      continue;
    }

    clean[key] = value;
  }

  return {
    valid: errors.length === 0,
    errors: context ? errors.map((e) => `${context}: ${e}`) : errors,
    scores: clean,
  };
};

/**
 * Validate a batch, reporting every bad row at once rather than failing on the
 * first — a teacher entering 40 students should see all their typos in one go.
 *
 * @returns {{ valid: boolean, errors: string[], rows: Array }}
 */
const validateScoreBatch = (results = [], labelFor = () => '') => {
  const errors = [];
  const rows = [];

  results.forEach((row, index) => {
    const context = labelFor(row, index) || `Row ${index + 1}`;
    const {
      valid,
      errors: rowErrors,
      scores,
    } = validateScores(row?.scores, context);

    if (!valid) errors.push(...rowErrors);
    else rows.push({ ...row, scores });
  });

  return { valid: errors.length === 0, errors, rows };
};

module.exports = { SCORE_COMPONENTS, validateScores, validateScoreBatch };
