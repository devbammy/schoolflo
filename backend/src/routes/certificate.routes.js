const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

// Generate certificates (Admin only)
router.post(
  '/report-card',
  protect,
  authorize('Admin'),
  certificateController.generateReportCard,
);

router.post(
  '/leaving-certificate',
  protect,
  authorize('Admin'),
  certificateController.generateLeavingCertificate,
);

router.post(
  '/admission-letter',
  protect,
  authorize('Admin'),
  certificateController.generateAdmissionLetter,
);

// Get certificates
router.get('/', protect, certificateController.getAllCertificates);

router.get('/:id', protect, certificateController.getCertificateById);

// Revoke certificate
router.put(
  '/:id/revoke',
  protect,
  authorize('Admin'),
  certificateController.revokeCertificate,
);

module.exports = router;
