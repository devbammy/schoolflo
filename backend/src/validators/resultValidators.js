const { body } = require('express-validator');
const { SCORE_BREAKDOWN } = require('../config/constants');
const {
  objectIdBody,
  objectIdParam,
  optionalObjectIdBody,
  stringBody,
  termBody,
  termQuery,
  academicYearBody,
  academicYearQuery,
} = require('./common');

/**
 * Score component rules.
 *
 * These duplicate the caps enforced in utils/scoreValidation.js on purpose:
 * this layer rejects malformed requests at the edge with per-field messages,
 * while scoreValidation remains the authority applied to every write path
 * (including any future importer that does not go through these routes).
 * Both read their bounds from SCORE_BREAKDOWN, so they cannot drift apart.
 */
const scoreRules = (prefix) => [
  body(`${prefix}.ca1`)
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: SCORE_BREAKDOWN.CA1_MAX })
    .withMessage(`CA1 must be between 0 and ${SCORE_BREAKDOWN.CA1_MAX}.`)
    .toFloat(),
  body(`${prefix}.ca2`)
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: SCORE_BREAKDOWN.CA2_MAX })
    .withMessage(`CA2 must be between 0 and ${SCORE_BREAKDOWN.CA2_MAX}.`)
    .toFloat(),
  body(`${prefix}.midTerm`)
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: SCORE_BREAKDOWN.MID_TERM_MAX })
    .withMessage(`Mid-Term must be between 0 and ${SCORE_BREAKDOWN.MID_TERM_MAX}.`)
    .toFloat(),
  body(`${prefix}.exam`)
    .optional({ values: 'null' })
    .isFloat({ min: 0, max: SCORE_BREAKDOWN.EXAM_MAX })
    .withMessage(`Exam must be between 0 and ${SCORE_BREAKDOWN.EXAM_MAX}.`)
    .toFloat(),
];

const upsertResultRules = [
  objectIdBody('student', 'Student'),
  objectIdBody('class', 'Class'),
  objectIdBody('subject', 'Subject'),
  optionalObjectIdBody('exam', 'Exam'),
  termBody(),
  academicYearBody(),
  ...scoreRules('scores'),
  stringBody('teacherComment', 'Teacher comment', { optional: true, max: 500 }),
];

const bulkResultRules = [
  objectIdBody('class', 'Class'),
  objectIdBody('subject', 'Subject'),
  termBody(),
  academicYearBody(),
  body('results')
    .isArray({ min: 1, max: 200 })
    .withMessage('Provide between 1 and 200 results.'),
  body('results.*.student').isMongoId().withMessage('Each row needs a valid student id.'),
  ...scoreRules('results.*.scores'),
  body('results.*.teacherComment')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Teacher comment is too long.'),
];

const publishResultRules = [
  objectIdBody('class', 'Class'),
  termBody(),
  academicYearBody(),
];

const reportCardRules = [
  objectIdParam('studentId', 'Student id'),
  termQuery(),
  academicYearQuery(),
];

const studentIdParamRules = [objectIdParam('studentId', 'Student id')];
const classIdParamRules = [objectIdParam('classId', 'Class id')];

module.exports = {
  scoreRules,
  upsertResultRules,
  bulkResultRules,
  publishResultRules,
  reportCardRules,
  studentIdParamRules,
  classIdParamRules,
};
