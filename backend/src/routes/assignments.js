const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  uploadAssignment,
  handleUploadErrors,
} = require('../services/fileService');
const {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  publishAssignment,
  deleteAssignment,
} = require('../controllers/assignmentController');
const {
  createAssignmentRules,
  idParam,
} = require('../validators/academicValidators');
const { paginationQuery } = require('../validators/common');

router.get('/', protect, validate(paginationQuery()), getAssignments);

router.get('/:id', protect, validate(idParam), getAssignmentById);

router.post(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  uploadAssignment.array('attachments', 5),
  handleUploadErrors,
  validate(createAssignmentRules),
  createAssignment,
);

router.put(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  uploadAssignment.array('attachments', 5),
  handleUploadErrors,
  validate(idParam),
  updateAssignment,
);

router.patch(
  '/:id/publish',
  protect,
  authorize('Admin', 'Teacher'),
  validate(idParam),
  publishAssignment,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  validate(idParam),
  deleteAssignment,
);

module.exports = router;
