const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Submission, Assignment } = require('../models/Assignment');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  uploadSubmission,
  handleUploadErrors,
  processUploadedFiles,
} = require('../services/fileService');
const { SUBMISSION_STATUS } = require('../config/constants');

// STUDENT SUBMITS ASSIGNMENT

router.post(
  '/',
  protect,
  authorize('Student'),
  uploadSubmission.array('files', 3),
  handleUploadErrors,
  async (req, res) => {
    try {
      const { assignmentId, comment } = req.body;

      if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) {
        return sendError(res, 400, 'Valid assignment ID is required');
      }

      const assignment = await Assignment.findById(assignmentId);

      if (!assignment || !assignment.isActive) {
        return sendError(res, 404, 'Assignment not found');
      }

      // Must be published
      if (!assignment.isPublished) {
        return sendError(res, 403, 'Assignment is not published yet');
      }

      // Prevent duplicate submission
      const existingSubmission = await Submission.findOne({
        assignment: assignmentId,
        student: req.user._id,
      });

      if (existingSubmission) {
        return sendError(
          res,
          400,
          'You have already submitted this assignment',
        );
      }

      // Late submission check
      const isLate = new Date() > assignment.dueDate;

      if (isLate && !assignment.allowLateSubmission) {
        return sendError(res, 400, 'Late submission is not allowed');
      }

      // Upload files
      const files = req.files?.length
        ? await processUploadedFiles(req.files, 'submissions')
        : [];

      const submission = await Submission.create({
        assignment: assignmentId,
        student: req.user._id,
        files,
        comment,
        isLate,

        status: isLate ? SUBMISSION_STATUS.LATE : SUBMISSION_STATUS.SUBMITTED,
      });

      const populatedSubmission = await Submission.findById(submission._id)
        .populate('student', 'firstName lastName')
        .populate('assignment', 'title dueDate totalMarks');

      return sendSuccess(res, 201, 'Assignment submitted successfully', {
        submission: populatedSubmission,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// TEACHER GRADES SUBMISSION

router.patch(
  '/:id/grade',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const { score, feedback } = req.body;

      const submission = await Submission.findById(req.params.id).populate(
        'assignment',
      );

      if (!submission) {
        return sendError(res, 404, 'Submission not found');
      }

      // Teacher can only grade their assignments
      if (
        req.user.role === 'Teacher' &&
        submission.assignment.teacher.toString() !== req.user._id.toString()
      ) {
        return sendError(res, 403, 'Unauthorized access');
      }

      // Validate score
      if (score < 0 || score > submission.assignment.totalMarks) {
        return sendError(
          res,
          400,
          `Score must be between 0 and ${submission.assignment.totalMarks}`,
        );
      }

      submission.score = score;
      submission.feedback = feedback;

      submission.status = SUBMISSION_STATUS.GRADED;

      submission.gradedBy = req.user._id;

      submission.gradedAt = new Date();

      await submission.save();

      const populatedSubmission = await Submission.findById(submission._id)
        .populate('student', 'firstName lastName')
        .populate('gradedBy', 'firstName lastName');

      return sendSuccess(res, 200, 'Submission graded successfully', {
        submission: populatedSubmission,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// GET SUBMISSIONS FOR ASSIGNMENT

router.get(
  '/assignment/:assignmentId',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const assignment = await Assignment.findById(req.params.assignmentId);

      if (!assignment) {
        return sendError(res, 404, 'Assignment not found');
      }

      // Teacher ownership check
      if (
        req.user.role === 'Teacher' &&
        assignment.teacher.toString() !== req.user._id.toString()
      ) {
        return sendError(res, 403, 'Unauthorized access');
      }

      const submissions = await Submission.find({
        assignment: req.params.assignmentId,
      })
        .populate(
          'student',
          `
            firstName
            lastName
            avatar
            studentProfile.admissionNumber
            `,
        )
        .sort({
          submittedAt: 1,
        });

      return sendSuccess(res, 200, 'Submissions fetched successfully', {
        count: submissions.length,
        submissions,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// GET STUDENT SUBMISSIONS

router.get('/mine', protect, authorize('Student'), async (req, res) => {
  try {
    if (!req.user?._id) {
      return sendError(res, 401, 'Unauthorized user');
    }

    const submissions = await Submission.find({
      student: req.user._id,
    })
      .populate({
        path: 'assignment',
        populate: [
          { path: 'subject', select: 'name' },
          { path: 'class', select: 'name' },
        ],
      })
      .sort({ submittedAt: -1 });

    return sendSuccess(res, 200, 'Your submissions', {
      submissions: submissions || [],
    });
  } catch (err) {
    console.error('SUBMISSION MINE ERROR:', err); // 🔥 IMPORTANT
    return sendError(res, 500, err.message);
  }
});

// GET SINGLE SUBMISSION

router.get('/:id', protect, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('student', 'firstName lastName')
      .populate({
        path: 'assignment',
        populate: [
          {
            path: 'subject',
            select: 'name',
          },
          {
            path: 'class',
            select: 'name',
          },
        ],
      });

    if (!submission) {
      return sendError(res, 404, 'Submission not found');
    }

    // Student can only view own submission
    if (
      req.user.role === 'Student' &&
      submission.student._id.toString() !== req.user._id.toString()
    ) {
      return sendError(res, 403, 'Unauthorized access');
    }

    return sendSuccess(res, 200, 'Submission fetched successfully', {
      submission,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

module.exports = router;
