const express = require('express');
const router = express.Router();
const { Exam } = require('../models/Exam');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');

router.get('/', protect, async (req, res) => {
  try {
    const { classId, term, academicYear } = req.query;
    const filter = {};
    if (classId) filter.class = classId;
    if (term) filter.term = term;
    if (academicYear) filter.academicYear = academicYear;

    const exams = await Exam.find(filter)
      .populate('class', 'name')
      .populate('subject', 'name code')
      .populate('teacher', 'firstName lastName')
      .sort({ startDate: -1 });
    return sendSuccess(res, 200, 'Exams fetched', { exams });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.post('/', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const exam = await Exam.create({ ...req.body, teacher: req.user._id });
    return sendSuccess(res, 201, 'Exam created', { exam });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.put('/:id', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    return sendSuccess(res, 200, 'Exam updated', { exam });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

router.delete(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      await Exam.findByIdAndDelete(req.params.id);
      return sendSuccess(res, 200, 'Exam deleted');
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

module.exports = router;
