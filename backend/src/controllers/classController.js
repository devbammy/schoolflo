const Class = require('../models/Class');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');

// @desc    List active classes
// @route   GET /api/v1/classes
// @access  Any authenticated user
const getClasses = async (req, res) => {
  const classes = await Class.find({ isActive: true })
    .populate('sections.classTeacher', 'firstName lastName')
    .populate('subjects', 'name code');

  return sendSuccess(res, 200, 'Classes fetched', { classes });
};

// @desc    Get one class
// @route   GET /api/v1/classes/:id
// @access  Any authenticated user
const getClassById = async (req, res) => {
  const cls = await Class.findById(req.params.id)
    .populate('sections.classTeacher', 'firstName lastName')
    .populate('subjects', 'name code');

  if (!cls) throw AppError.notFound('Class not found');

  return sendSuccess(res, 200, 'Class fetched', { class: cls });
};

// @desc    Create a class
// @route   POST /api/v1/classes
// @access  Admin
const createClass = async (req, res) => {
  const cleanedData = { ...req.body };

  // An unset classTeacher arrives as '' from the form, which is not a castable
  // ObjectId — normalise it to null before saving.
  if (Array.isArray(cleanedData.sections)) {
    cleanedData.sections = cleanedData.sections.map((section) => ({
      ...section,
      classTeacher: section.classTeacher === '' ? null : section.classTeacher,
    }));
  }

  const cls = await Class.create(cleanedData);
  return sendSuccess(res, 201, `${cls.name} Class created`, { class: cls });
};

// @desc    Update a class
// @route   PUT /api/v1/classes/:id
// @access  Admin
const updateClass = async (req, res) => {
  const cls = await Class.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!cls) throw AppError.notFound('Class not found');

  return sendSuccess(res, 200, `${cls.name} Class updated`, { class: cls });
};

// @desc    Deactivate a class (soft delete)
// @route   DELETE /api/v1/classes/:id
// @access  Admin
const deactivateClass = async (req, res) => {
  const cls = await Class.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true },
  );

  if (!cls) throw AppError.notFound('Class not found');

  return sendSuccess(res, 200, `${cls.name} Class deactivated`, { class: cls });
};

module.exports = {
  getClasses,
  getClassById,
  createClass,
  updateClass,
  deactivateClass,
};
