const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const requireFeature = require('../middleware/requireFeature');
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

// Gateway routes only. Everything below them — manual payments, balances,
// the financial report — is core, and a school collecting fees at the office
// needs all of it. Removing "payments" wholesale would take the fee ledger
// with it.
//
// requireFeature sits ahead of protect deliberately. A feature this school
// does not run should be indistinguishable from a route that was never
// mounted — which is what a whole disabled domain looks like — and that means
// 404 for everyone, signed in or not, without a database round trip first.
router.post(
  '/initialize/paystack',
  requireFeature('onlinePayments'),
  protect,
  validate(initPaymentRules),
  initPaystack,
);
router.post(
  '/verify/paystack',
  requireFeature('onlinePayments'),
  protect,
  validate(verifyPaymentRules),
  verifyPaystackPayment,
);
router.post(
  '/initialize/flutterwave',
  requireFeature('onlinePayments'),
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
