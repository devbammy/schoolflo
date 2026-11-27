const { body, query } = require('express-validator');
const {
  objectIdBody,
  termBody,
  academicYearBody,
  academicYearQuery,
  termQuery,
} = require('./common');
const {
  BEHAVIOUR_TRAITS,
  BEHAVIOUR_RATINGS,
} = require('../models/ReportRemark');

// One request saves a class's worth at most; a JSS class rarely passes 60.
const MAX_ROWS = 200;

const getRemarksRules = [
  query('class')
    .exists({ checkFalsy: true })
    .withMessage('Class is required.')
    .bail()
    .isMongoId()
    .withMessage('Class is not valid.'),
  termQuery('term'),
  query('term').exists({ checkFalsy: true }).withMessage('Term is required.'),
  academicYearQuery('academicYear'),
  query('academicYear')
    .exists({ checkFalsy: true })
    .withMessage('Academic year is required.'),
  query('section')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 30 }),
];

const saveRemarksRules = [
  objectIdBody('class', 'Class'),
  termBody('term'),
  academicYearBody('academicYear'),
  body('remarks')
    .isArray({ min: 1, max: MAX_ROWS })
    .withMessage(`Send between 1 and ${MAX_ROWS} students.`),
  body('remarks.*.student')
    .isMongoId()
    .withMessage('Each row needs a valid student.'),
  ...BEHAVIOUR_TRAITS.map((trait) =>
    body(`remarks.*.behaviour.${trait}`)
      .optional({ values: 'falsy' })
      .isIn(BEHAVIOUR_RATINGS)
      .withMessage(
        `Behaviour ratings must be one of: ${BEHAVIOUR_RATINGS.join(', ')}.`,
      ),
  ),
  body('remarks.*.teacherComment')
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max: 300 })
    .withMessage("Keep the teacher's comment under 300 characters."),
];

module.exports = { getRemarksRules, saveRemarksRules };
