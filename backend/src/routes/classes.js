const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deactivateClass,
} = require('../controllers/classController');
const {
  createClassRules,
  updateClassRules,
  idParam,
} = require('../validators/academicValidators');

router.get('/', protect, getClasses);

router.get('/:id', protect, validate(idParam), getClassById);

router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(createClassRules),
  createClass,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(updateClassRules),
  updateClass,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deactivateClass,
);

module.exports = router;
