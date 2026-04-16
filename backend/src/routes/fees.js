const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { createFeeStructure, getFeeStructures } = require('../controllers/paymentController');
const { Fees } = require('../models/Fees');
const { sendSuccess, sendError } = require('../utils/apiResponse');

router.get('/', protect, getFeeStructures);
router.post('/', protect, authorize('Admin'), createFeeStructure);

router.get('/:id', protect, async (req, res) => {
  try {
    const fee = await Fees.findById(req.params.id).populate('class', 'name level');
    if (!fee) return sendError(res, 404, 'Fee structure not found');
    return sendSuccess(res, 200, 'Fee structure fetched', { fee });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const fee = await Fees.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return sendSuccess(res, 200, 'Fee structure updated', { fee });
  } catch (err) { return sendError(res, 500, err.message); }
});

module.exports = router;
