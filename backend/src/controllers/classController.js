const Class = require('../models/Class');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { applySort } = require('../utils/listSort');

// @desc    List active classes
// @route   GET /api/v1/classes
// @access  Any authenticated user
const getClasses = async (req, res) => {
  const classes = await applySort(
    Class.find({ isActive: true }),
    req.query.sort,
    ['name'],
  )
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

// What the class form may set. Anything else in the body (isActive, _id,
// timestamps) belongs to the system.
const EDITABLE = [
  'name',
  'level',
  'sections',
  'subjects',
  'academicYear',
  'description',
];

/**
 * The form's fields, cleaned for saving.
 *
 * An unset class teacher arrives as '' and is not a castable ObjectId. Create
 * cleaned it and update did not, so editing any class with a section that had
 * no teacher failed, and the cast error printed as "[object Object]".
 */
const classFields = (body) => {
  const data = {};
  EDITABLE.forEach((field) => {
    if (body[field] !== undefined) data[field] = body[field];
  });

  if (Array.isArray(data.sections)) {
    data.sections = data.sections.map((section) => ({
      ...section,
      classTeacher: section.classTeacher || null,
    }));
  }

  return data;
};

// @desc    Create a class, or bring back a deactivated one of the same name
// @route   POST /api/v1/classes
// @access  Admin
//
// Deleting a class only deactivates it, so its name stays taken by a record
// nobody can see, and creating it again was refused as "already in use".
// Restoring that record, rather than refusing or making a second one, keeps
// every student, result and fee already filed under it attached.
const createClass = async (req, res) => {
  const data = classFields(req.body);

  const existing = await Class.findOne({ name: data.name });

  if (existing?.isActive) {
    throw AppError.conflict(`A class named ${data.name} already exists.`);
  }

  if (existing) {
    existing.set({ ...data, isActive: true });
    await existing.save();
    return sendSuccess(res, 200, `${existing.name} Class restored`, {
      class: existing,
      restored: true,
    });
  }

  const cls = await Class.create(data);
  return sendSuccess(res, 201, `${cls.name} Class created`, { class: cls });
};

// @desc    Update a class
// @route   PUT /api/v1/classes/:id
// @access  Admin
const updateClass = async (req, res) => {
  const data = classFields(req.body);

  if (data.name) {
    const clash = await Class.findOne({
      name: data.name,
      _id: { $ne: req.params.id },
    }).select('isActive');

    if (clash) {
      throw AppError.conflict(
        clash.isActive
          ? `A class named ${data.name} already exists.`
          : `A deactivated class is still named ${data.name}. Create ${data.name} again to restore it instead.`,
      );
    }
  }

  const cls = await Class.findByIdAndUpdate(req.params.id, data, {
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
