const { body, param, query } = require('express-validator');
const { SORT_CHOICES } = require('../utils/listSort');
const { TERMS, ROLES } = require('../config/constants');

const TERM_VALUES = Object.values(TERMS);
const ROLE_VALUES = Object.values(ROLES);

// Matches "2024/2025"
const ACADEMIC_YEAR_PATTERN = /^\d{4}\/\d{4}$/;

/** A required Mongo ObjectId in the body. */
const objectIdBody = (field, label = field) =>
  body(field)
    .exists({ checkFalsy: true })
    .withMessage(`${label} is required.`)
    .bail()
    .isMongoId()
    .withMessage(`${label} must be a valid id.`);

/** An optional ObjectId in the body — empty string and null are allowed. */
const optionalObjectIdBody = (field, label = field) =>
  body(field)
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage(`${label} must be a valid id.`);

/** A required ObjectId in the URL. */
const objectIdParam = (field = 'id', label = 'id') =>
  param(field).isMongoId().withMessage(`${label} must be a valid id.`);

const termBody = (field = 'term', { optional = false } = {}) => {
  const chain = optional
    ? body(field).optional({ values: 'falsy' })
    : body(field)
        .exists({ checkFalsy: true })
        .withMessage('Term is required.')
        .bail();
  return chain
    .isIn(TERM_VALUES)
    .withMessage(`Term must be one of: ${TERM_VALUES.join(', ')}.`);
};

const termQuery = (field = 'term') =>
  query(field)
    .optional({ values: 'falsy' })
    .isIn(TERM_VALUES)
    .withMessage(`Term must be one of: ${TERM_VALUES.join(', ')}.`);

const academicYearBody = (
  field = 'academicYear',
  { optional = false } = {},
) => {
  const chain = optional
    ? body(field).optional({ values: 'falsy' })
    : body(field)
        .exists({ checkFalsy: true })
        .withMessage('Academic year is required.')
        .bail();
  return chain
    .matches(ACADEMIC_YEAR_PATTERN)
    .withMessage('Academic year must look like 2024/2025.');
};

const academicYearQuery = (field = 'academicYear') =>
  query(field)
    .optional({ values: 'falsy' })
    .matches(ACADEMIC_YEAR_PATTERN)
    .withMessage('Academic year must look like 2024/2025.');

/** A trimmed, length-bounded string. */
const stringBody = (
  field,
  label = field,
  { optional = false, min = 1, max = 200 } = {},
) => {
  const chain = optional
    ? body(field).optional({ values: 'falsy' })
    : body(field)
        .exists({ checkFalsy: true })
        .withMessage(`${label} is required.`)
        .bail();
  return chain
    .isString()
    .withMessage(`${label} must be text.`)
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(`${label} must be between ${min} and ${max} characters.`);
};

/** A non-negative amount of money, in whole naira. */
const amountBody = (
  field = 'amount',
  label = 'Amount',
  { optional = false } = {},
) => {
  const chain = optional
    ? body(field).optional({ values: 'null' })
    : body(field)
        .exists({ checkFalsy: true })
        .withMessage(`${label} is required.`)
        .bail();
  return chain
    .isFloat({ min: 0 })
    .withMessage(`${label} must be a positive number.`)
    .toFloat();
};

/**
 * How an email address is normalised before it is looked up or stored.
 *
 * validator's default also strips "+tags" (and dots, `-tags` and so on) for a
 * list of providers, which silently merged `parent+kid@gmail.com` into
 * `parent@gmail.com` — and gave login rate limiting a hole, because the limiter
 * counts the address as typed while the lookup used the stripped one, so
 * `victim+1@`, `victim+2@`, … each got a fresh budget against one account.
 *
 * Lowercasing and googlemail.com → gmail.com are all that remains. The rate
 * limiter (middleware/rateLimitKeys.js) applies the same two rules, so both see
 * the same account.
 */
const NORMALIZE_EMAIL_OPTIONS = {
  all_lowercase: true,
  gmail_lowercase: true,
  gmail_remove_dots: false,
  gmail_remove_subaddress: false,
  gmail_convert_googlemaildotcom: true,
  outlookdotcom_lowercase: true,
  outlookdotcom_remove_subaddress: false,
  yahoo_lowercase: true,
  yahoo_remove_subaddress: false,
  icloud_lowercase: true,
  icloud_remove_subaddress: false,
};

const booleanBody = (field, label = field) =>
  body(field)
    .optional()
    .isBoolean()
    .withMessage(`${label} must be true or false.`)
    .toBoolean();

const dateBody = (field, label = field, { optional = true } = {}) => {
  const chain = optional
    ? body(field).optional({ values: 'falsy' })
    : body(field)
        .exists({ checkFalsy: true })
        .withMessage(`${label} is required.`)
        .bail();
  return chain
    .isISO8601()
    .withMessage(`${label} must be a valid date.`)
    .toDate();
};

const paginationQuery = () => [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be 1 or more.')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100.')
    .toInt(),
];

/** `?sort=` on a list of named things. See utils/listSort.js. */
const sortQuery = () => [
  query('sort')
    .optional()
    .isIn(SORT_CHOICES)
    .withMessage(`Sort must be one of: ${SORT_CHOICES.join(', ')}.`),
];

module.exports = {
  sortQuery,
  TERM_VALUES,
  ROLE_VALUES,
  ACADEMIC_YEAR_PATTERN,
  objectIdBody,
  optionalObjectIdBody,
  objectIdParam,
  termBody,
  termQuery,
  academicYearBody,
  academicYearQuery,
  stringBody,
  amountBody,
  booleanBody,
  dateBody,
  paginationQuery,
  NORMALIZE_EMAIL_OPTIONS,
};
