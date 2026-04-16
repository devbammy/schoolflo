const express = require('express');
const router = express.Router();
const { Assignment } = require('../models/Assignment');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { upload, processUploadedFiles } = require('../services/fileService');

router.get('/', protect, async (req, res) => {
  try {
    const { classId, subjectId, term, academicYear } = req.query;
    const filter = { isActive: true };
    if (classId) filter.class = classId;
    if (subjectId) filter.subject = subjectId;
    if (term) filter.term = term;
    if (academicYear) filter.academicYear = academicYear;
    if (req.user.role === 'Teacher') filter.teacher = req.user._id;

    const assignments = await Assignment.find(filter)
      .populate('class', 'name').populate('subject', 'name code')
      .populate('teacher', 'firstName lastName')
      .sort({ dueDate: 1 });
    return sendSuccess(res, 200, 'Assignments fetched', { assignments });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.post('/', protect, authorize('Admin', 'Teacher'), upload.array('attachments', 5), async (req, res) => {
  try {
    const attachments = req.files?.length ? await processUploadedFiles(req.files, 'assignments') : [];
    const assignment = await Assignment.create({
      ...req.body,
      teacher: req.user._id,
      attachments,
    });
    return sendSuccess(res, 201, 'Assignment created', { assignment });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.put('/:id', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const assignment = await Assignment.findByIdAndUpdate(req.params.id, req.body, { new: true });
    return sendSuccess(res, 200, 'Assignment updated', { assignment });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.delete('/:id', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    await Assignment.findByIdAndUpdate(req.params.id, { isActive: false });
    return sendSuccess(res, 200, 'Assignment removed');
  } catch (err) { return sendError(res, 500, err.message); }
});

module.exports = router;
