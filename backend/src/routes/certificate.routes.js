const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const Certificate = require('../models/Certificate');
const User = require('../models/User');
const { sendSuccess } = require('../utils/apiResponse');

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

// Student-specific routes
router.get(
  '/student/my-certificates',
  protect,
  authorize('Student'),
  async (req, res) => {
    try {
      const certificates = await Certificate.find({
        student: req.user._id,
        status: { $ne: 'Revoked' },
      })
        .populate('issuedBy', 'firstName lastName')
        .sort({ createdAt: -1 });

      sendSuccess(res, 200, 'Student certificates retrieved', certificates);
    } catch (error) {
      sendError(res, error.message, 500);
    }
  },
);

// Parent-specific routes
router.get(
  '/parent/children-certificates',
  protect,
  authorize('Parent'),
  async (req, res) => {
    try {
      const parent = await User.findById(req.user._id).populate(
        'parentProfile.children',
      );
      if (!parent || !parent.parentProfile.children.length) {
        return sendSuccess(res, 200, 'No children found', { certificates: [] });
      }

      const childrenIds = parent.parentProfile.children.map(
        (child) => child._id,
      );

      const certificates = await Certificate.find({
        student: { $in: childrenIds },
        status: { $ne: 'Revoked' },
      })
        .populate('student', 'firstName lastName studentProfile')
        .populate('issuedBy', 'firstName lastName')
        .sort({ createdAt: -1 });

      sendSuccess(res, 200, 'Children certificates retrieved', certificates);
    } catch (error) {
      sendError(res, error.message, 500);
    }
  },
);

// Revoke certificate
router.put(
  '/:id/revoke',
  protect,
  authorize('Admin'),
  certificateController.revokeCertificate,
);

module.exports = router;
