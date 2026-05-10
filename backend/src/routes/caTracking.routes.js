const express = require('express');
const router = express.Router();
const caTrackingController = require('../controllers/caTrackingController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Sync trackers after results publish
router.post(
  '/sync',
  protect,
  authorize('Admin', 'Teacher'),
  caTrackingController.syncTrackers,
);

// Bulk sync trackers for entire class
router.post(
  '/sync-class',
  protect,
  authorize('Admin'),
  caTrackingController.syncClassTrackers,
);

// Get student tracking
router.get(
  '/student/:studentId',
  protect,
  caTrackingController.getStudentTracking,
);

// Get class tracking for subject
router.get(
  '/class/:classId/subject/:subjectId',
  protect,
  authorize('Admin', 'Teacher'),
  caTrackingController.getClassTracking,
);

// Get student analytics
router.get(
  '/analytics/:studentId',
  protect,
  caTrackingController.getStudentAnalytics,
);

// Get chart data
router.get(
  '/chart/:studentId/:subjectId',
  protect,
  caTrackingController.getChartData,
);

module.exports = router;
