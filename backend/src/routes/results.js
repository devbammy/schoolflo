const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  upsertResult,
  bulkUpsertResults,
  publishResults,
  getReportCard,
  getClassResults,
  getStudentResultHistory,
  getClassSummary,
} = require('../controllers/resultController');
const {
  upsertResultRules,
  bulkResultRules,
  publishResultRules,
  reportCardRules,
  studentIdParamRules,
  classIdParamRules,
} = require('../validators/resultValidators');

router.post(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  validate(upsertResultRules),
  upsertResult,
);
router.post(
  '/bulk',
  protect,
  authorize('Admin', 'Teacher'),
  validate(bulkResultRules),
  bulkUpsertResults,
);
router.post(
  '/publish',
  protect,
  authorize('Admin'),
  validate(publishResultRules),
  publishResults,
);
router.get(
  '/report-card/:studentId',
  protect,
  validate(reportCardRules),
  getReportCard,
);
// A class's standings for a term, by arm or for the whole class. Above
// '/class/:classId' so 'summary' is never read as part of that route.
router.get(
  '/class/:classId/summary',
  protect,
  authorize('Admin'),
  validate(classIdParamRules),
  getClassSummary,
);
router.get(
  '/class/:classId',
  protect,
  authorize('Admin', 'Teacher'),
  validate(classIdParamRules),
  getClassResults,
);
router.get(
  '/student/:studentId/history',
  protect,
  validate(studentIdParamRules),
  getStudentResultHistory,
);

module.exports = router;
