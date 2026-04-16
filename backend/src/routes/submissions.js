const express = require('express');
const router = express.Router();
const { Submission, Assignment } = require('../models/Assignment');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { upload, processUploadedFiles } = require('../services/fileService');

// Student submits assignment
router.post('/', protect, authorize('Student'), upload.array('files', 3), async (req, res) => {
  try {
    const { assignmentId, comment } = req.body;
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) return sendError(res, 404, 'Assignment not found');

    const isLate = new Date() > assignment.dueDate;
    if (isLate && !assignment.allowLateSubmission) {
      return sendError(res, 400, 'This assignment no longer accepts submissions');
    }

    const files = req.files?.length ? await processUploadedFiles(req.files, 'submissions') : [];
    const existing = await Submission.findOne({ assignment: assignmentId, student: req.user._id });
    if (existing) return sendError(res, 400, 'You have already submitted this assignment');

    const submission = await Submission.create({
      assignment: assignmentId,
      student: req.user._id,
      files, comment, isLate,
      status: isLate ? 'Late' : 'Submitted',
    });
    return sendSuccess(res, 201, 'Assignment submitted', { submission });
  } catch (err) { return sendError(res, 500, err.message); }
});

// Teacher grades submission
router.patch('/:id/grade', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const { score, feedback } = req.body;
    const submission = await Submission.findByIdAndUpdate(
      req.params.id,
      { score, feedback, status: 'Graded', gradedBy: req.user._id, gradedAt: new Date() },
      { new: true }
    ).populate('student', 'firstName lastName');
    return sendSuccess(res, 200, 'Submission graded', { submission });
  } catch (err) { return sendError(res, 500, err.message); }
});

// Get submissions for an assignment
router.get('/assignment/:assignmentId', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const submissions = await Submission.find({ assignment: req.params.assignmentId })
      .populate('student', 'firstName lastName avatar studentProfile.admissionNumber')
      .sort({ submittedAt: 1 });
    return sendSuccess(res, 200, 'Submissions fetched', { submissions });
  } catch (err) { return sendError(res, 500, err.message); }
});

// Get student's own submissions
router.get('/mine', protect, authorize('Student'), async (req, res) => {
  try {
    const submissions = await Submission.find({ student: req.user._id })
      .populate({ path: 'assignment', populate: [{ path: 'subject', select: 'name' }, { path: 'class', select: 'name' }] })
      .sort({ submittedAt: -1 });
    return sendSuccess(res, 200, 'Your submissions', { submissions });
  } catch (err) { return sendError(res, 500, err.message); }
});

module.exports = router;
