const { body } = require('express-validator');
const { ATTENDANCE_STATUS, EXAM_TYPES } = require('../config/constants');
const {
  objectIdBody,
  objectIdParam,
  optionalObjectIdBody,
  stringBody,
  termBody,
  academicYearBody,
  dateBody,
  booleanBody,
  NORMALIZE_EMAIL_OPTIONS,
} = require('./common');

const CLASS_LEVELS = ['JSS', 'SS', 'Primary', 'College'];
const ATTENDANCE_VALUES = Object.values(ATTENDANCE_STATUS);
const EXAM_TYPE_VALUES = Object.values(EXAM_TYPES);

const idParam = [objectIdParam('id', 'id')];

// ─── Subjects ────────────────────────────────────────────────────────────────
const createSubjectRules = [
  stringBody('name', 'Subject name', { min: 2, max: 100 }),
  stringBody('code', 'Subject code', { min: 1, max: 20 }),
  stringBody('description', 'Description', { optional: true, max: 500 }),
  body('classes').optional().isArray().withMessage('Classes must be a list.'),
  body('classes.*').optional().isMongoId().withMessage('Invalid class id.'),
  body('teachers').optional().isArray().withMessage('Teachers must be a list.'),
  body('teachers.*').optional().isMongoId().withMessage('Invalid teacher id.'),
  booleanBody('isCore', 'isCore'),
  body('creditUnit')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Credit unit must be between 1 and 10.')
    .toInt(),
];

const updateSubjectRules = [
  ...idParam,
  stringBody('name', 'Subject name', { optional: true, min: 2, max: 100 }),
  stringBody('code', 'Subject code', { optional: true, min: 1, max: 20 }),
  body('creditUnit')
    .optional()
    .isInt({ min: 1, max: 10 })
    .withMessage('Credit unit must be between 1 and 10.')
    .toInt(),
  booleanBody('isActive', 'isActive'),
];

// ─── Classes ─────────────────────────────────────────────────────────────────
const createClassRules = [
  stringBody('name', 'Class name', { min: 1, max: 60 }),
  body('level')
    .exists({ checkFalsy: true })
    .withMessage('Level is required.')
    .bail()
    .isIn(CLASS_LEVELS)
    .withMessage(`Level must be one of: ${CLASS_LEVELS.join(', ')}.`),
  academicYearBody(),
  body('sections').optional().isArray().withMessage('Sections must be a list.'),
  body('sections.*.name')
    .optional()
    .isString()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('Section name must be 1-30 characters.'),
  body('sections.*.capacity')
    .optional()
    .isInt({ min: 1, max: 500 })
    .withMessage('Section capacity must be between 1 and 500.')
    .toInt(),
];

const updateClassRules = [
  ...idParam,
  stringBody('name', 'Class name', { optional: true, min: 1, max: 60 }),
  body('level')
    .optional({ values: 'falsy' })
    .isIn(CLASS_LEVELS)
    .withMessage(`Level must be one of: ${CLASS_LEVELS.join(', ')}.`),
  academicYearBody('academicYear', { optional: true }),
];

// ─── Attendance ──────────────────────────────────────────────────────────────
const markAttendanceRules = [
  objectIdBody('classId', 'Class'),
  stringBody('section', 'Section', { optional: true, max: 30 }),
  dateBody('date', 'Date', { optional: false }),
  // Optional: the controller fills these in from the active academic calendar
  // when the client does not send them, which is the normal case. They stay
  // accepted so a register for an earlier term can still be backfilled.
  termBody('term', { optional: true }),
  academicYearBody('academicYear', { optional: true }),
  body('records')
    .isArray({ min: 1, max: 500 })
    .withMessage('Provide between 1 and 500 attendance records.'),
  body('records.*.student')
    .isMongoId()
    .withMessage('Each record needs a valid student id.'),
  body('records.*.status')
    .isIn(ATTENDANCE_VALUES)
    .withMessage(`Status must be one of: ${ATTENDANCE_VALUES.join(', ')}.`),
  body('records.*.note')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 300 })
    .withMessage('Note is too long.'),
];

// ─── Exams ───────────────────────────────────────────────────────────────────
const createExamRules = [
  stringBody('title', 'Exam title', { min: 2, max: 150 }),
  body('type')
    .exists({ checkFalsy: true })
    .withMessage('Exam type is required.')
    .bail()
    .isIn(EXAM_TYPE_VALUES)
    .withMessage(`Type must be one of: ${EXAM_TYPE_VALUES.join(', ')}.`),
  termBody(),
  academicYearBody(),
  objectIdBody('class', 'Class'),
  objectIdBody('subject', 'Subject'),
  dateBody('startDate', 'Start date', { optional: false }),
  dateBody('endDate', 'End date'),
  body('totalMarks')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Total marks must be between 1 and 1000.')
    .toInt(),
  body('passMark')
    .optional()
    .isInt({ min: 0, max: 1000 })
    .withMessage('Pass mark must be a positive number.')
    .toInt(),
];

const updateExamRules = [
  ...idParam,
  stringBody('title', 'Exam title', { optional: true, min: 2, max: 150 }),
  body('type')
    .optional({ values: 'falsy' })
    .isIn(EXAM_TYPE_VALUES)
    .withMessage(`Type must be one of: ${EXAM_TYPE_VALUES.join(', ')}.`),
  dateBody('startDate', 'Start date'),
  dateBody('endDate', 'End date'),
];

// ─── Announcements ───────────────────────────────────────────────────────────
const createAnnouncementRules = [
  stringBody('title', 'Title', { min: 2, max: 200 }),
  stringBody('body', 'Body', { min: 1, max: 10000 }),
  body('targetAudience')
    .optional()
    .isArray()
    .withMessage('Target audience must be a list.'),
  body('targetAudience.*')
    .optional()
    .isIn(['All', 'Admin', 'Teacher', 'Student', 'Parent'])
    .withMessage('Invalid target audience.'),
  body('priority')
    .optional({ values: 'falsy' })
    .isIn(['Low', 'Normal', 'High', 'Urgent'])
    .withMessage('Priority must be Low, Normal, High or Urgent.'),
  booleanBody('channels.dashboard', 'Dashboard channel'),
  booleanBody('channels.email', 'Email channel'),
  booleanBody('channels.sms', 'SMS channel'),
  dateBody('expiresAt', 'Expiry date'),
];

// ─── Assignments & submissions ───────────────────────────────────────────────
const createAssignmentRules = [
  stringBody('title', 'Title', { min: 2, max: 200 }),
  stringBody('description', 'Description', { optional: true, max: 5000 }),
  objectIdBody('class', 'Class'),
  objectIdBody('subject', 'Subject'),
  termBody(),
  academicYearBody(),
  dateBody('dueDate', 'Due date', { optional: false }),
  body('totalMarks')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Total marks must be between 1 and 1000.')
    .toInt(),
  booleanBody('allowLateSubmission', 'allowLateSubmission'),
];

const gradeSubmissionRules = [
  ...idParam,
  body('score')
    .exists({ checkFalsy: false })
    .withMessage('Score is required.')
    .bail()
    .isFloat({ min: 0 })
    .withMessage('Score must be a positive number.')
    .toFloat(),
  stringBody('feedback', 'Feedback', { optional: true, max: 2000 }),
];

// ─── Users ───────────────────────────────────────────────────────────────────
const updateUserRules = [
  ...idParam,
  stringBody('firstName', 'First name', { optional: true, min: 1, max: 50 }),
  stringBody('lastName', 'Last name', { optional: true, min: 1, max: 50 }),
  stringBody('phone', 'Phone', { optional: true, max: 20 }),
  optionalObjectIdBody('studentProfile.class', 'Class'),
  optionalObjectIdBody('studentProfile.parentId', 'Parent'),
  optionalObjectIdBody('teacherProfile.classTeacherOf', 'Class'),
  body('studentProfile.profileStatus')
    .optional({ values: 'falsy' })
    .isIn(['Active', 'Graduated', 'Withdrawn', 'Suspended'])
    .withMessage('Invalid profile status.'),
];

// ─── Parents ─────────────────────────────────────────────────────────────────
const createParentRules = [
  stringBody('firstName', 'First name', { min: 1, max: 50 }),
  stringBody('lastName', 'Last name', { min: 1, max: 50 }),
  body('email')
    .exists({ checkFalsy: true })
    .withMessage('Email is required.')
    .bail()
    .isEmail()
    .withMessage('Enter a valid email address.')
    .normalizeEmail(NORMALIZE_EMAIL_OPTIONS),
  body('password')
    .exists({ checkFalsy: true })
    .withMessage('Password is required.')
    .bail()
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be between 8 and 128 characters.'),
  stringBody('phone', 'Phone', { optional: true, max: 20 }),
  body('parentProfile.relationship')
    .optional({ values: 'falsy' })
    .isIn(['Father', 'Mother', 'Guardian', 'Other'])
    .withMessage('Relationship must be Father, Mother, Guardian or Other.'),
  body('childrenIds')
    .optional()
    .isArray()
    .withMessage('Children must be a list.'),
  body('childrenIds.*').optional().isMongoId().withMessage('Invalid child id.'),
];

const updateParentRules = [
  ...idParam,
  stringBody('firstName', 'First name', { optional: true, min: 1, max: 50 }),
  stringBody('lastName', 'Last name', { optional: true, min: 1, max: 50 }),
  stringBody('phone', 'Phone', { optional: true, max: 20 }),
  body('parentProfile.relationship')
    .optional({ values: 'falsy' })
    .isIn(['Father', 'Mother', 'Guardian', 'Other'])
    .withMessage('Relationship must be Father, Mother, Guardian or Other.'),
];

const linkChildRules = [
  ...idParam,
  body('action')
    .exists({ checkFalsy: true })
    .withMessage('Action is required.')
    .bail()
    .isIn(['link', 'unlink'])
    .withMessage("Action must be either 'link' or 'unlink'."),
  objectIdBody('childId', 'Child'),
];

// An admin's setting for one student's results (resultAccessController).
const resultsAccessRules = [
  ...idParam,
  body('mode')
    .exists({ checkFalsy: true })
    .withMessage("Choose how this student's results are shown.")
    .bail()
    .isIn(['auto', 'open', 'withheld'])
    .withMessage('mode must be auto, open or withheld.'),
  body('note')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Keep the note under 200 characters.'),
];

module.exports = {
  CLASS_LEVELS,
  idParam,
  resultsAccessRules,
  createParentRules,
  updateParentRules,
  linkChildRules,
  createSubjectRules,
  updateSubjectRules,
  createClassRules,
  updateClassRules,
  markAttendanceRules,
  createExamRules,
  updateExamRules,
  createAnnouncementRules,
  createAssignmentRules,
  gradeSubmissionRules,
  updateUserRules,
};
