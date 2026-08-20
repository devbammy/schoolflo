const express = require('express');
const router = express.Router();
const promotionController = require('../controllers/promotionController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  createPromotionRules,
  idParam,
} = require('../validators/operationsValidators');

// All promotion routes are Admin-only
router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(createPromotionRules),
  promotionController.createPromotionBatch,
);

router.get(
  '/',
  protect,
  authorize('Admin'),
  promotionController.getAllPromotions,
);

router.get(
  '/:id',
  protect,
  authorize('Admin'),
  promotionController.getPromotionById,
);

router.post(
  '/:id/auto-process',
  protect,
  authorize('Admin'),
  validate(idParam),
  promotionController.autoProcessPromotion,
);

router.put(
  '/:id/student/:studentId',
  protect,
  authorize('Admin'),
  promotionController.updateStudentStatus,
);

router.post(
  '/:id/apply',
  protect,
  authorize('Admin'),
  validate(idParam),
  promotionController.applyPromotions,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  promotionController.deletePromotion,
);

router.get(
  '/:id/stats',
  protect,
  authorize('Admin'),
  promotionController.getPromotionStats,
);

module.exports = router;
