const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const { sendSuccess } = require('../utils/apiResponse');
const validate = require('../middleware/validate');
const {
  generateCertificateRules,
} = require('../validators/operationsValidators');

// Generate certificates (Admin only)
router.post(
  '/report-card',
  protect,
  authorize('Admin'),
  validate(generateCertificateRules),
  certificateController.generateReportCard,
);

router.post(
  '/leaving-certificate',
  protect,
  authorize('Admin'),
  validate(generateCertificateRules),
  certificateController.generateLeavingCertificate,
);

router.post(
  '/admission-letter',
  protect,
  authorize('Admin'),
  validate(generateCertificateRules),
  certificateController.generateAdmissionLetter,
);

// Get certificates
router.get('/', protect, certificateController.getAllCertificates);

router.get('/:id', protect, certificateController.getCertificateById);

// Student-specific routes
router.get(
  '/student/my-certificates',
  protect,
  authorize('Student'),
  certificateController.getMyCertificates,
);

// Parent-specific routes
router.get(
  '/parent/children-certificates',
  protect,
  authorize('Parent'),
  certificateController.getChildrenCertificates,
);

// Revoke certificate
router.put(
  '/:id/revoke',
  protect,
  authorize('Admin'),
  certificateController.revokeCertificate,
);

module.exports = router;
