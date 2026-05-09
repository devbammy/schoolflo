const express = require('express');
const router = express.Router();
const examScheduleController = require('../controllers/examScheduleController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Admin & Teacher routes
router.post(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  examScheduleController.createSchedule,
);

router.get('/', protect, examScheduleController.getSchedules);

router.get('/:id', protect, examScheduleController.getScheduleById);

router.put(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  examScheduleController.updateSchedule,
);

router.post(
  '/:id/publish',
  protect,
  authorize('Admin'),
  examScheduleController.publishSchedule,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  examScheduleController.deleteSchedule,
);

// Teacher-specific routes
router.get(
  '/teacher/invigilations',
  protect,
  authorize('Teacher'),
  examScheduleController.getTeacherInvigilations,
);

// Student-specific routes
router.get(
  '/student/my-schedules',
  protect,
  authorize('Student'),
  examScheduleController.getStudentSchedules,
);

// Parent-specific routes
router.get(
  '/parent/children-schedules',
  protect,
  authorize('Parent'),
  examScheduleController.getParentSchedules,
);

// Conflict checking
router.post(
  '/check-conflicts',
  protect,
  authorize('Admin', 'Teacher'),
  examScheduleController.checkConflicts,
);

module.exports = router;
