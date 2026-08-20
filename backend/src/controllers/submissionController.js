const mongoose = require('mongoose');
const { Submission, Assignment } = require('../models/Assignment');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { processUploadedFiles } = require('../services/fileService');
const { SUBMISSION_STATUS } = require('../config/constants');

// @desc    Student submits an assignment
// @route   POST /api/v1/submissions
// @access  Student
const createSubmission = async (req, res) => {
  const { assignmentId, comment } = req.body;

  if (!assignmentId || !mongoose.Types.ObjectId.isValid(assignmentId)) {
    throw AppError.badRequest('Valid assignment ID is required');
  }

  const assignment = await Assignment.findById(assignmentId);

  if (!assignment || !assignment.isActive) {
    throw AppError.notFound('Assignment not found');
  }

  if (!assignment.isPublished) {
    throw AppError.forbidden('Assignment is not published yet');
  }

  // One submission per student per assignment (also enforced by a unique index)
  const existingSubmission = await Submission.findOne({
    assignment: assignmentId,
    student: req.user._id,
  });

  if (existingSubmission) {
    throw AppError.conflict('You have already submitted this assignment');
  }

  const isLate = new Date() > assignment.dueDate;

  if (isLate && !assignment.allowLateSubmission) {
    throw AppError.badRequest('Late submission is not allowed');
  }

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
};

// @desc    Teacher grades a submission
// @route   PATCH /api/v1/submissions/:id/grade
// @access  Admin, Teacher (own assignments)
const gradeSubmission = async (req, res) => {
  const { score, feedback } = req.body;

  const submission = await Submission.findById(req.params.id).populate(
    'assignment',
  );

  if (!submission) throw AppError.notFound('Submission not found');

  if (
    req.user.role === 'Teacher' &&
    String(submission.assignment.teacher) !== String(req.user._id)
  ) {
    throw AppError.forbidden('You can only grade your own assignments');
  }

  // The generic validator caps the score at zero; the real ceiling is the
  // assignment's own totalMarks, which is only knowable here.
  if (score < 0 || score > submission.assignment.totalMarks) {
    throw AppError.badRequest(
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
};

// @desc    All submissions for an assignment
// @route   GET /api/v1/submissions/assignment/:assignmentId
// @access  Admin, Teacher (own assignments)
const getSubmissionsForAssignment = async (req, res) => {
  const assignment = await Assignment.findById(req.params.assignmentId);

  if (!assignment) throw AppError.notFound('Assignment not found');

  if (
    req.user.role === 'Teacher' &&
    String(assignment.teacher) !== String(req.user._id)
  ) {
    throw AppError.forbidden('You can only view your own assignments');
  }

  const submissions = await Submission.find({
    assignment: req.params.assignmentId,
  })
    .populate(
      'student',
      'firstName lastName avatar studentProfile.admissionNumber',
    )
    .sort({ submittedAt: 1 });

  return sendSuccess(res, 200, 'Submissions fetched successfully', {
    count: submissions.length,
    submissions,
  });
};

// @desc    The caller's own submissions
// @route   GET /api/v1/submissions/mine
// @access  Student
const getMySubmissions = async (req, res) => {
  const submissions = await Submission.find({ student: req.user._id })
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
};

// @desc    One submission
// @route   GET /api/v1/submissions/:id
// @access  Admin, Teacher, Student (own), Parent (own child)
const getSubmissionById = async (req, res) => {
  const submission = await Submission.findById(req.params.id)
    .populate('student', 'firstName lastName')
    .populate({
      path: 'assignment',
      populate: [
        { path: 'subject', select: 'name' },
        { path: 'class', select: 'name' },
      ],
    });

  if (!submission) throw AppError.notFound('Submission not found');

  const ownerId = String(submission.student?._id);

  if (req.user.role === 'Student' && ownerId !== String(req.user._id)) {
    throw AppError.forbidden('You can only view your own submissions');
  }

  // Parents were previously able to read any submission by id.
  if (req.user.role === 'Parent') {
    const childIds = req.user.parentProfile?.children?.map(String) || [];
    if (!childIds.includes(ownerId)) {
      throw AppError.forbidden(
        "You can only view your own children's submissions",
      );
    }
  }

  return sendSuccess(res, 200, 'Submission fetched successfully', {
    submission,
  });
};

module.exports = {
  createSubmission,
  gradeSubmission,
  getSubmissionsForAssignment,
  getMySubmissions,
  getSubmissionById,
};
