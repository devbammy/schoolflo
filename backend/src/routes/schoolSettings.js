const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { uploadAvatar, handleUploadErrors } = require('../services/fileService');
const {
  getSettings,
  updateSettings,
  uploadImage,
  removeImage,
} = require('../controllers/schoolSettingsController');

const textField = (field, max) =>
  body(field)
    .optional({ values: 'null' })
    .isString()
    .trim()
    .isLength({ max })
    .withMessage(`Keep the ${field} under ${max} characters.`);

const imageParam = param('image')
  .isIn(['logo', 'signature'])
  .withMessage('Unknown image.');

router.get('/', protect, authorize('Admin'), getSettings);

router.put(
  '/',
  protect,
  authorize('Admin'),
  validate([
    textField('address', 200),
    textField('email', 120),
    textField('phones', 120),
  ]),
  updateSettings,
);

// Images go through the avatar uploader: images only, 1 MB, held in memory.
router.put(
  '/:image',
  protect,
  authorize('Admin'),
  validate([imageParam]),
  uploadAvatar.single('file'),
  handleUploadErrors,
  uploadImage,
);

router.delete(
  '/:image',
  protect,
  authorize('Admin'),
  validate([imageParam]),
  removeImage,
);

module.exports = router;
