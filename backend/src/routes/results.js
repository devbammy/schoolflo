const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  upsertResult, bulkUpsertResults, publishResults,
  getReportCard, getClassResults, getStudentResultHistory,
} = require('../controllers/resultController');

router.post('/', protect, authorize('Admin', 'Teacher'), upsertResult);
router.post('/bulk', protect, authorize('Admin', 'Teacher'), bulkUpsertResults);
router.post('/publish', protect, authorize('Admin'), publishResults);
router.get('/report-card/:studentId', protect, getReportCard);
router.get('/class/:classId', protect, authorize('Admin', 'Teacher'), getClassResults);
router.get('/student/:studentId/history', protect, getStudentResultHistory);

module.exports = router;
