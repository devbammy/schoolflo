const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  initPaystack,
  verifyPaystackPayment,
  initFlutterwave,
  recordManualPayment,
  getStudentPayments,
  getStudentFeeBalances,
  getFinancialReport,
} = require('../controllers/paymentController');
const {
  initPaymentRules,
  verifyPaymentRules,
  manualPaymentRules,
} = require('../validators/paymentValidators');
const { objectIdParam } = require('../validators/common');

router.post(
  '/initialize/paystack',
  protect,
  validate(initPaymentRules),
  initPaystack,
);
router.post(
  '/verify/paystack',
  protect,
  validate(verifyPaymentRules),
  verifyPaystackPayment,
);
router.post(
  '/initialize/flutterwave',
  protect,
  validate(initPaymentRules),
  initFlutterwave,
);
router.post(
  '/manual',
  protect,
  authorize('Admin'),
  validate(manualPaymentRules),
  recordManualPayment,
);
router.get('/report', protect, authorize('Admin'), getFinancialReport);
router.get(
  '/balance/:studentId',
  protect,
  validate([objectIdParam('studentId', 'Student id')]),
  getStudentFeeBalances,
);
router.get(
  '/student/:studentId',
  protect,
  validate([objectIdParam('studentId', 'Student id')]),
  getStudentPayments,
);

module.exports = router;
