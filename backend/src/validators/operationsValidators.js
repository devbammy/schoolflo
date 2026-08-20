const { body } = require('express-validator');
const { EVENT_TYPES } = require('../models/AcademicCalendar');
const {
  objectIdBody,
  objectIdParam,
  optionalObjectIdBody,
  stringBody,
  termBody,
  academicYearBody,
  dateBody,
  booleanBody,
} = require('./common');

const AUDIENCES = ['All', 'Admin', 'Teacher', 'Student', 'Parent'];
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const EXAM_SCHEDULE_TYPES = ['Mid-Term', 'Final Exam', 'Mock Exam', 'External Exam'];
const BORROWER_TYPES = ['Student', 'Teacher', 'Staff'];

// "09:00 AM" — the format the timetable and exam schedule models expect.
const TIME_PATTERN = /^(0?[1-9]|1[0-2]):[0-5]\d\s?(AM|PM|am|pm)$/;

const idParam = [objectIdParam('id', 'id')];

const audienceRules = (field = 'targetAudience') => [
  body(field).optional().isArray().withMessage('Target audience must be a list.'),
  body(`${field}.*`)
    .optional()
    .isIn(AUDIENCES)
    .withMessage(`Audience must be one of: ${AUDIENCES.join(', ')}.`),
];

// ─── Academic calendar ───────────────────────────────────────────────────────
const createCalendarRules = [
  academicYearBody(),
  stringBody('title', 'Title', { optional: true, max: 150 }),
];

const calendarEventRules = [
  stringBody('title', 'Event title', { min: 2, max: 150 }),
  body('type')
    .optional({ values: 'falsy' })
    .isIn(EVENT_TYPES)
    .withMessage(`Event type must be one of: ${EVENT_TYPES.join(', ')}.`),
  dateBody('startDate', 'Start date', { optional: false }),
  dateBody('endDate', 'End date'),
  body('endDate').custom((value, { req }) => {
    if (value && req.body.startDate && new Date(value) < new Date(req.body.startDate)) {
      throw new Error('End date cannot be before the start date.');
    }
    return true;
  }),
  stringBody('description', 'Description', { optional: true, max: 2000 }),
  booleanBody('isAllDay', 'isAllDay'),
  ...audienceRules(),
  body('color')
    .optional({ values: 'falsy' })
    .matches(/^#[0-9a-fA-F]{6}$/)
    .withMessage('Colour must be a hex value like #0891B2.'),
];

const termDatesRules = [
  termBody(),
  dateBody('startDate', 'Start date', { optional: false }),
  dateBody('endDate', 'End date', { optional: false }),
  body('endDate').custom((value, { req }) => {
    if (value && req.body.startDate && new Date(value) < new Date(req.body.startDate)) {
      throw new Error('Term end date cannot be before the start date.');
    }
    return true;
  }),
];

// ─── Timetable ───────────────────────────────────────────────────────────────
const timetableRules = [
  objectIdBody('class', 'Class'),
  termBody(),
  academicYearBody(),
  stringBody('section', 'Section', { optional: true, max: 30 }),
  body('periods').optional().isArray().withMessage('Periods must be a list.'),
  body('periods.*.day')
    .optional()
    .isIn(DAYS)
    .withMessage(`Day must be one of: ${DAYS.join(', ')}.`),
  body('periods.*.startTime')
    .optional()
    .matches(TIME_PATTERN)
    .withMessage('Start time must look like 09:00 AM.'),
  body('periods.*.endTime')
    .optional()
    .matches(TIME_PATTERN)
    .withMessage('End time must look like 11:00 AM.'),
  body('periods.*.subject').optional().isMongoId().withMessage('Invalid subject id.'),
  body('periods.*.teacher').optional().isMongoId().withMessage('Invalid teacher id.'),
];

// ─── Library ─────────────────────────────────────────────────────────────────
const createBookRules = [
  stringBody('title', 'Book title', { min: 1, max: 250 }),
  stringBody('author', 'Author', { min: 1, max: 150 }),
  stringBody('isbn', 'ISBN', { optional: true, max: 20 }),
  stringBody('category', 'Category', { optional: true, max: 80 }),
  body('totalCopies')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('Total copies must be between 0 and 10000.')
    .toInt(),
  body('availableCopies')
    .optional()
    .isInt({ min: 0, max: 10000 })
    .withMessage('Available copies must be between 0 and 10000.')
    .toInt(),
];

const borrowBookRules = [
  objectIdBody('book', 'Book'),
  objectIdBody('borrower', 'Borrower'),
  body('borrowerType')
    .optional({ values: 'falsy' })
    .isIn(BORROWER_TYPES)
    .withMessage(`Borrower type must be one of: ${BORROWER_TYPES.join(', ')}.`),
  dateBody('dueDate', 'Due date'),
];

// ─── Exam schedules ──────────────────────────────────────────────────────────
const examScheduleRules = [
  stringBody('title', 'Title', { min: 2, max: 150 }),
  body('examType')
    .optional({ values: 'falsy' })
    .isIn(EXAM_SCHEDULE_TYPES)
    .withMessage(`Exam type must be one of: ${EXAM_SCHEDULE_TYPES.join(', ')}.`),
  objectIdBody('class', 'Class'),
  termBody(),
  academicYearBody(),
  body('sessions').optional().isArray().withMessage('Sessions must be a list.'),
  body('sessions.*.subject').optional().isMongoId().withMessage('Invalid subject id.'),
  body('sessions.*.invigilator').optional().isMongoId().withMessage('Invalid invigilator id.'),
  body('sessions.*.startTime')
    .optional()
    .matches(TIME_PATTERN)
    .withMessage('Session start time must look like 09:00 AM.'),
  body('sessions.*.endTime')
    .optional()
    .matches(TIME_PATTERN)
    .withMessage('Session end time must look like 11:00 AM.'),
  body('sessions.*.duration')
    .optional()
    .isInt({ min: 1, max: 600 })
    .withMessage('Duration must be between 1 and 600 minutes.')
    .toInt(),
];

// ─── Promotions ──────────────────────────────────────────────────────────────
const createPromotionRules = [
  academicYearBody(),
  optionalObjectIdBody('fromClass', 'Class'),
  body('passMark')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Pass mark must be between 0 and 100.')
    .toFloat(),
];

const promotionDecisionRules = [
  ...idParam,
  objectIdBody('studentId', 'Student'),
  body('decision')
    .optional({ values: 'falsy' })
    .isIn(['Promoted', 'Repeated', 'Graduated', 'Withdrawn'])
    .withMessage('Invalid promotion decision.'),
  stringBody('reason', 'Reason', { optional: true, max: 500 }),
];

// ─── Certificates ────────────────────────────────────────────────────────────
const generateCertificateRules = [
  body('studentId')
    .exists({ checkFalsy: true })
    .withMessage('Student is required.')
    .bail()
    .isString()
    .withMessage('Student must be an id or admission number.')
    .trim()
    .isLength({ min: 3, max: 60 })
    .withMessage('Student identifier looks invalid.'),
  termBody('term', { optional: true }),
  academicYearBody('academicYear', { optional: true }),
];

const revokeCertificateRules = [
  ...idParam,
  stringBody('reason', 'Reason', { optional: true, max: 500 }),
];

// ─── CA tracking ─────────────────────────────────────────────────────────────
const caSyncRules = [
  objectIdBody('studentId', 'Student'),
  academicYearBody(),
];

module.exports = {
  idParam,
  createCalendarRules,
  calendarEventRules,
  termDatesRules,
  timetableRules,
  createBookRules,
  borrowBookRules,
  examScheduleRules,
  createPromotionRules,
  promotionDecisionRules,
  generateCertificateRules,
  revokeCertificateRules,
  caSyncRules,
};
