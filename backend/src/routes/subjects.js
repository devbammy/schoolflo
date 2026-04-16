const express = require('express');
const router = express.Router();
const Subject = require('../models/Subject');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');

router.get('/', protect, async (req, res) => {
  try {
    const subjects = await Subject.find({ isActive: true })
      .populate('teachers', 'firstName lastName')
      .populate('classes', 'name');
    return sendSuccess(res, 200, 'Subjects fetched', { subjects });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.post('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const subject = await Subject.create(req.body);
    return sendSuccess(res, 201, 'Subject created', { subject });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return sendSuccess(res, 200, 'Subject updated', { subject });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    await Subject.findByIdAndUpdate(req.params.id, { isActive: false });
    return sendSuccess(res, 200, 'Subject deactivated');
  } catch (err) { return sendError(res, 500, err.message); }
});

module.exports = router;
