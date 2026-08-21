const { body, query } = require('express-validator');
const { ATTENDANCE_STATUS } = require('../config/constants');
const {
  objectIdParam,
  objectIdBody,
  stringBody,
  paginationQuery,
} = require('./common');

const STATUS_VALUES = Object.values(ATTENDANCE_STATUS);

// A calendar day, not an instant. Accepting a full ISO timestamp here would
// let the same request mean different days depending on the caller's clock —
// see utils/schoolTime for why the day is resolved from these parts instead.
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// A 24h wall-clock time. Seconds are deliberately not accepted: nobody
// corrects a timesheet to the second.
const CLOCK_PATTERN = /^\d{1,2}:\d{2}$/;

const idParam = [objectIdParam('id', 'Attendance record id')];

const dayQuery = (field) =>
  query(field)
    .optional({ values: 'falsy' })
    .matches(DAY_PATTERN)
    .withMessage(`${field} must look like 2026-08-21.`);

const statusQuery = () =>
  query('status')
    .optional({ values: 'falsy' })
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}.`);

const clockTimeBody = (field, label) =>
  body(field)
    .optional({ values: 'falsy' })
    .matches(CLOCK_PATTERN)
    .withMessage(`${label} must look like 08:30.`);

/** Clocking in or out — the note is the only thing the caller supplies. */
const clockRules = [stringBody('note', 'Note', { optional: true, max: 500 })];

const listRules = [
  ...paginationQuery(),
  query('staff')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid staff id.'),
  statusQuery(),
  dayQuery('date'),
  dayQuery('from'),
  dayQuery('to'),
];

const myAttendanceRules = [
  ...paginationQuery(),
  statusQuery(),
  dayQuery('from'),
  dayQuery('to'),
];

const dailyRosterRules = [
  dayQuery('date'),
  query('role')
    .optional({ values: 'falsy' })
    .isIn(['Teacher', 'Admin'])
    .withMessage('Role must be either Teacher or Admin.'),
];

const summaryRules = [dayQuery('from'), dayQuery('to')];

const markRules = [
  objectIdBody('staff', 'Staff member'),
  body('status')
    .exists({ checkFalsy: true })
    .withMessage('A status is required.')
    .bail()
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}.`),
  body('date')
    .optional({ values: 'falsy' })
    .matches(DAY_PATTERN)
    .withMessage('Date must look like 2026-08-21.'),
  clockTimeBody('clockInAt', 'Clock-in time'),
  clockTimeBody('clockOutAt', 'Clock-out time'),
  // Recording an absence against a staff member is a decision somebody may be
  // asked about later, so it carries a reason.
  stringBody('note', 'Note', { optional: true, max: 1000 }),
];

const updateRules = [
  ...idParam,
  body('status')
    .optional({ values: 'falsy' })
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}.`),
  clockTimeBody('clockInAt', 'Clock-in time'),
  clockTimeBody('clockOutAt', 'Clock-out time'),
  stringBody('note', 'Note', { optional: true, max: 1000 }),
];

module.exports = {
  idParam,
  clockRules,
  listRules,
  myAttendanceRules,
  dailyRosterRules,
  summaryRules,
  markRules,
  updateRules,
};
