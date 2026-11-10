const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  uploadAvatar,
  uploadCsv,
  handleUploadErrors,
} = require('../services/fileService');
const {
  getUsers,
  getUserById,
  getUserProfile,
  updateUser,
  toggleUserStatus,
  deleteUser,
  uploadUserAvatar,
  getStudentsInClass,
} = require('../controllers/userController');
const {
  updateUserRules,
  idParam,
  resultsReleaseRules,
} = require('../validators/academicValidators');
const {
  objectIdParam,
  paginationQuery,
  sortQuery,
} = require('../validators/common');
const {
  previewUserImport,
  commitUserImport,
  downloadTemplate,
  getImportColumns,
} = require('../controllers/userImportController');
const { issueLoginSlip } = require('../controllers/loginSlipController');
const { setResultsRelease } = require('../controllers/resultAccessController');

// Bulk import. These sit above '/:id' for the same reason the student roster
// does — 'import' must never be read as a user id.
router.get('/import/columns', protect, authorize('Admin'), getImportColumns);

router.get('/import/template', protect, authorize('Admin'), downloadTemplate);

router.post(
  '/import/preview',
  protect,
  authorize('Admin'),
  uploadCsv.single('file'),
  handleUploadErrors,
  previewUserImport,
);

router.post('/import', protect, authorize('Admin'), commitUserImport);

// Static segments first: '/students/class/:classId' must be matched before
// anything that could treat 'students' as an :id.
router.get(
  '/students/class/:classId',
  protect,
  authorize('Admin', 'Teacher'),
  validate([objectIdParam('classId', 'Class id')]),
  getStudentsInClass,
);

router.get(
  '/',
  protect,
  authorize('Admin'),
  validate([...paginationQuery(), ...sortQuery()]),
  getUsers,
);

router.get(
  '/:id/profile',
  protect,
  authorize('Admin'),
  validate(idParam),
  getUserProfile,
);

router.get(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  validate(idParam),
  getUserById,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(updateUserRules),
  updateUser,
);

// Show a student's results although fees are not complete, or withdraw that.
router.put(
  '/:id/results-release',
  protect,
  authorize('Admin'),
  validate(resultsReleaseRules),
  setResultsRelease,
);

// A new password for a student, returned once for a printed login slip.
router.post(
  '/:id/login-slip',
  protect,
  authorize('Admin'),
  validate(idParam),
  issueLoginSlip,
);

router.patch(
  '/:id/toggle-status',
  protect,
  authorize('Admin'),
  validate(idParam),
  toggleUserStatus,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deleteUser,
);

router.post(
  '/:id/avatar',
  protect,
  uploadAvatar.single('avatar'),
  handleUploadErrors,
  validate(idParam),
  uploadUserAvatar,
);

module.exports = router;
