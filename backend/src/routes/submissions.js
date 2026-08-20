const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  uploadSubmission,
  handleUploadErrors,
} = require('../services/fileService');
const {
  createSubmission,
  gradeSubmission,
  getSubmissionsForAssignment,
  getMySubmissions,
  getSubmissionById,
} = require('../controllers/submissionController');
const { gradeSubmissionRules } = require('../validators/academicValidators');
const { objectIdParam } = require('../validators/common');

router.post(
  '/',
  protect,
  authorize('Student'),
  uploadSubmission.array('files', 3),
  handleUploadErrors,
  createSubmission,
);

router.patch(
  '/:id/grade',
  protect,
  authorize('Admin', 'Teacher'),
  validate(gradeSubmissionRules),
  gradeSubmission,
);

router.get(
  '/assignment/:assignmentId',
  protect,
  authorize('Admin', 'Teacher'),
  validate([objectIdParam('assignmentId', 'Assignment id')]),
  getSubmissionsForAssignment,
);

// Must precede '/:id' so 'mine' is never treated as an id.
router.get('/mine', protect, authorize('Student'), getMySubmissions);

router.get(
  '/:id',
  protect,
  validate([objectIdParam('id', 'Submission id')]),
  getSubmissionById,
);

module.exports = router;
