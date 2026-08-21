const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  markAttendance,
  getClassRegister,
  getClassReport,
  getMyClasses,
  getStudentSummary,
} = require('../controllers/attendanceController');
const { markAttendanceRules } = require('../validators/academicValidators');
const {
  objectIdParam,
  termQuery,
  academicYearQuery,
} = require('../validators/common');

const dateQuery = (field) =>
  query(field)
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage(`${field} must be a valid date.`);

router.post(
  '/mark',
  protect,
  authorize('Admin', 'Teacher'),
  validate(markAttendanceRules),
  markAttendance,
);

// Must precede '/class/:classId' so 'my-classes' is never read as an id.
router.get('/my-classes', protect, authorize('Admin', 'Teacher'), getMyClasses);

router.get(
  '/class/:classId/report',
  protect,
  authorize('Admin', 'Teacher'),
  validate([
    objectIdParam('classId', 'Class id'),
    dateQuery('from'),
    dateQuery('to'),
  ]),
  getClassReport,
);

router.get(
  '/class/:classId',
  protect,
  authorize('Admin', 'Teacher'),
  validate([objectIdParam('classId', 'Class id'), dateQuery('date')]),
  getClassRegister,
);

router.get(
  '/student/:studentId/summary',
  protect,
  validate([
    objectIdParam('studentId', 'Student id'),
    termQuery(),
    academicYearQuery(),
  ]),
  getStudentSummary,
);

module.exports = router;
