const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  createFeeStructure,
  getFeeStructures,
  getFeeStructureById,
  updateFeeStructure,
} = require('../controllers/paymentController');
const {
  createFeeRules,
  updateFeeRules,
} = require('../validators/paymentValidators');
const { objectIdParam, sortQuery } = require('../validators/common');

router.get('/', protect, validate(sortQuery()), getFeeStructures);

router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(createFeeRules),
  createFeeStructure,
);

router.get(
  '/:id',
  protect,
  validate([objectIdParam('id', 'Fee structure id')]),
  getFeeStructureById,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(updateFeeRules),
  updateFeeStructure,
);

module.exports = router;
