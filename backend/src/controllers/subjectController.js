const Subject = require('../models/Subject');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');

// @desc    List active subjects
// @route   GET /api/v1/subjects
// @access  Any authenticated user
const getSubjects = async (req, res) => {
  const subjects = await Subject.find({ isActive: true })
    .populate('teachers', 'firstName lastName')
    .populate('classes', 'name');

  return sendSuccess(res, 200, 'Subjects fetched', { subjects });
};

// @desc    Create a subject
// @route   POST /api/v1/subjects
// @access  Admin
const createSubject = async (req, res) => {
  const subject = await Subject.create(req.body);
  return sendSuccess(res, 201, 'Subject created', { subject });
};

// @desc    Update a subject
// @route   PUT /api/v1/subjects/:id
// @access  Admin
const updateSubject = async (req, res) => {
  const subject = await Subject.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!subject) throw AppError.notFound('Subject not found');

  return sendSuccess(res, 200, 'Subject updated', { subject });
};

// @desc    Deactivate a subject (soft delete)
// @route   DELETE /api/v1/subjects/:id
// @access  Admin
const deactivateSubject = async (req, res) => {
  const subject = await Subject.findByIdAndUpdate(req.params.id, {
    isActive: false,
  });

  if (!subject) throw AppError.notFound('Subject not found');

  return sendSuccess(res, 200, 'Subject deactivated');
};

module.exports = {
  getSubjects,
  createSubject,
  updateSubject,
  deactivateSubject,
};
