const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getClassRemarks,
  saveClassRemarks,
} = require('../controllers/reportRemarkController');
const {
  getRemarksRules,
  saveRemarksRules,
} = require('../validators/reportRemarkValidators');

// Behaviour ratings and teacher's comments for report cards. Teachers reach
// the controller, which then admits only the class's form teacher.
router.get(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  validate(getRemarksRules),
  getClassRemarks,
);

router.put(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  validate(saveRemarksRules),
  saveClassRemarks,
);

module.exports = router;
