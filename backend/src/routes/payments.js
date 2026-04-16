const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  initPaystack, verifyPaystackPayment,
  initFlutterwave,
  recordManualPayment, getStudentPayments, getFinancialReport,
} = require('../controllers/paymentController');

router.post('/initialize/paystack', protect, initPaystack);
router.post('/verify/paystack', protect, verifyPaystackPayment);
router.post('/initialize/flutterwave', protect, initFlutterwave);
router.post('/manual', protect, authorize('Admin'), recordManualPayment);
router.get('/report', protect, authorize('Admin'), getFinancialReport);
router.get('/student/:studentId', protect, getStudentPayments);

module.exports = router;
