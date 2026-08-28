const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { uploadAvatar, handleUploadErrors } = require('../services/fileService');
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
} = require('../validators/academicValidators');
const { objectIdParam, paginationQuery } = require('../validators/common');

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
  validate(paginationQuery()),
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
