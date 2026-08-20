const mongoose = require('mongoose');
const { Assignment } = require('../models/Assignment');
const { sendSuccess, getPaginationParams } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { processUploadedFiles } = require('../services/fileService');

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Multipart form fields arrive as strings, so booleans need converting.
 * Returns undefined when the field was absent, so callers can tell "not sent"
 * from "sent as false".
 */
const toBoolean = (value) => {
  if (value === undefined || value === null || value === '') return undefined;
  return value === true || value === 'true';
};

/**
 * Assignments belong to the teacher who created them.
 * Admins are unrestricted.
 */
const assertCanManage = (user, assignment) => {
  if (
    user.role === 'Teacher' &&
    String(assignment.teacher) !== String(user._id)
  ) {
    throw AppError.forbidden('You can only manage your own assignments');
  }
};

// @desc    List assignments
// @route   GET /api/v1/assignments
// @access  Any authenticated user (teachers see only their own)
const getAssignments = async (req, res) => {
  const { classId, subjectId, term, academicYear, status, search } = req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = { isActive: true };

  // Teacher sees only their assignments
  if (req.user.role === 'Teacher') filter.teacher = req.user._id;

  if (classId && mongoose.Types.ObjectId.isValid(classId)) {
    filter.class = classId;
  }
  if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
    filter.subject = subjectId;
  }
  if (term) filter.term = term;
  if (academicYear) filter.academicYear = academicYear;
  if (status === 'published') filter.isPublished = true;
  if (status === 'draft') filter.isPublished = false;

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }];
  }

  const [assignments, total] = await Promise.all([
    Assignment.find(filter)
      .populate('class', 'name')
      .populate('subject', 'name code')
      .populate('teacher', 'firstName lastName')
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Assignment.countDocuments(filter),
  ]);

  return sendSuccess(res, 200, 'Assignments fetched successfully', {
    assignments,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    },
  });
};

// @desc    Get one assignment
// @route   GET /api/v1/assignments/:id
// @access  Any authenticated user
const getAssignmentById = async (req, res) => {
  const assignment = await Assignment.findOne({
    _id: req.params.id,
    isActive: true,
  })
    .populate('class', 'name')
    .populate('subject', 'name code')
    .populate('teacher', 'firstName lastName email')
    .populate('submissionCount');

  if (!assignment) throw AppError.notFound('Assignment not found');

  return sendSuccess(res, 200, 'Assignment fetched successfully', {
    assignment,
  });
};

// @desc    Create an assignment
// @route   POST /api/v1/assignments
// @access  Admin, Teacher
const createAssignment = async (req, res) => {
  if (req.body.dueDate && new Date(req.body.dueDate) < new Date()) {
    throw AppError.badRequest('Due date cannot be in the past');
  }

  const attachments = req.files?.length
    ? await processUploadedFiles(req.files, 'assignments')
    : [];

  const assignment = await Assignment.create({
    title: req.body.title,
    description: req.body.description,
    instructions: req.body.instructions,
    class: req.body.class,
    subject: req.body.subject,
    term: req.body.term,
    academicYear: req.body.academicYear,
    dueDate: req.body.dueDate,
    totalMarks: req.body.totalMarks,
    allowLateSubmission: toBoolean(req.body.allowLateSubmission) ?? false,
    isPublished: toBoolean(req.body.isPublished) ?? false,
    teacher: req.user._id,
    attachments,
  });

  const populatedAssignment = await Assignment.findById(assignment._id)
    .populate('class', 'name')
    .populate('subject', 'name code')
    .populate('teacher', 'firstName lastName');

  return sendSuccess(res, 201, 'Assignment created successfully', {
    assignment: populatedAssignment,
  });
};

// @desc    Update an assignment
// @route   PUT /api/v1/assignments/:id
// @access  Admin, Teacher (own)
const updateAssignment = async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment || !assignment.isActive) {
    throw AppError.notFound('Assignment not found');
  }

  assertCanManage(req.user, assignment);

  let attachments = assignment.attachments;

  if (req.files?.length) {
    const uploadedFiles = await processUploadedFiles(req.files, 'assignments');
    attachments = [...attachments, ...uploadedFiles];
  }

  const allowLate = toBoolean(req.body.allowLateSubmission);
  const published = toBoolean(req.body.isPublished);

  Object.assign(assignment, {
    title: req.body.title ?? assignment.title,
    description: req.body.description ?? assignment.description,
    instructions: req.body.instructions ?? assignment.instructions,
    class: req.body.class ?? assignment.class,
    subject: req.body.subject ?? assignment.subject,
    term: req.body.term ?? assignment.term,
    academicYear: req.body.academicYear ?? assignment.academicYear,
    dueDate: req.body.dueDate ?? assignment.dueDate,
    totalMarks: req.body.totalMarks ?? assignment.totalMarks,
    allowLateSubmission: allowLate ?? assignment.allowLateSubmission,
    isPublished: published ?? assignment.isPublished,
    attachments,
  });

  await assignment.save();

  const updatedAssignment = await Assignment.findById(assignment._id)
    .populate('class', 'name')
    .populate('subject', 'name code')
    .populate('teacher', 'firstName lastName');

  return sendSuccess(res, 200, 'Assignment updated successfully', {
    assignment: updatedAssignment,
  });
};

// @desc    Publish an assignment
// @route   PATCH /api/v1/assignments/:id/publish
// @access  Admin, Teacher (own)
const publishAssignment = async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment || !assignment.isActive) {
    throw AppError.notFound('Assignment not found');
  }

  assertCanManage(req.user, assignment);

  assignment.isPublished = true;
  await assignment.save();

  return sendSuccess(res, 200, 'Assignment published successfully', {
    assignment,
  });
};

// @desc    Soft-delete an assignment
// @route   DELETE /api/v1/assignments/:id
// @access  Admin, Teacher (own)
const deleteAssignment = async (req, res) => {
  const assignment = await Assignment.findById(req.params.id);

  if (!assignment || !assignment.isActive) {
    throw AppError.notFound('Assignment not found');
  }

  assertCanManage(req.user, assignment);

  assignment.isActive = false;
  await assignment.save();

  return sendSuccess(res, 200, 'Assignment deleted successfully');
};

module.exports = {
  getAssignments,
  getAssignmentById,
  createAssignment,
  updateAssignment,
  publishAssignment,
  deleteAssignment,
};
