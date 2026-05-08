const express = require('express');
const router = express.Router();
const Class = require('../models/Class');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');

router.get('/', protect, async (req, res) => {
  try {
    const classes = await Class.find({ isActive: true })
      .populate('sections.classTeacher', 'firstName lastName')
      .populate('subjects', 'name code');
    return sendSuccess(res, 200, 'Classes fetched', { classes });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.get('/:id', protect, async (req, res) => {
  try {
    const cls = await Class.findById(req.params.id)
      .populate('sections.classTeacher', 'firstName lastName')
      .populate('subjects', 'name code');
    if (!cls) return sendError(res, 404, 'Class not found');
    return sendSuccess(res, 200, 'Class fetched', { class: cls });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.post('/', protect, authorize('Admin'), async (req, res) => {
  try {
    // Clean empty strings in sections for classTeacher ObjectId field
    const cleanedData = { ...req.body };
    if (cleanedData.sections && Array.isArray(cleanedData.sections)) {
      cleanedData.sections = cleanedData.sections.map((section) => ({
        ...section,
        classTeacher: section.classTeacher === '' ? null : section.classTeacher,
      }));
    }
    const cls = await Class.create(cleanedData);
    return sendSuccess(res, 201, `${cls.name} Class created`, { class: cls });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!cls) return sendError(res, 404, 'Class not found');
    return sendSuccess(res, 200, `${cls.name} Class updated`, {
      class: cls,
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const cls = await Class.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true },
    );
    if (!cls) return sendError(res, 404, 'Class not found');
    return sendSuccess(res, 200, `${cls.name} Class deactivated`, {
      class: cls,
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

module.exports = router;
