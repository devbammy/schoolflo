const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  markAttendance,
  getClassRegister,
  getStudentSummary,
} = require('../controllers/attendanceController');
const { markAttendanceRules } = require('../validators/academicValidators');
const { objectIdParam } = require('../validators/common');

router.post(
  '/mark',
  protect,
  authorize('Admin', 'Teacher'),
  validate(markAttendanceRules),
  markAttendance,
);

router.get(
  '/class/:classId',
  protect,
  authorize('Admin', 'Teacher'),
  validate([objectIdParam('classId', 'Class id')]),
  getClassRegister,
);

router.get(
  '/student/:studentId/summary',
  protect,
  validate([objectIdParam('studentId', 'Student id')]),
  getStudentSummary,
);

module.exports = router;
