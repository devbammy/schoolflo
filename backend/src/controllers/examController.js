const { Exam } = require('../models/Exam');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');

// @desc    List exams, optionally filtered
// @route   GET /api/v1/exams
// @access  Any authenticated user
const getExams = async (req, res) => {
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
};

// @desc    Create an exam
// @route   POST /api/v1/exams
// @access  Admin, Teacher
const createExam = async (req, res) => {
  const exam = await Exam.create({ ...req.body, teacher: req.user._id });
  return sendSuccess(res, 201, 'Exam created', { exam });
};

// @desc    Update an exam
// @route   PUT /api/v1/exams/:id
// @access  Admin, Teacher (own)
const updateExam = async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw AppError.notFound('Exam not found');

  // A teacher may only amend an exam they created.
  if (
    req.user.role === 'Teacher' &&
    String(exam.teacher) !== String(req.user._id)
  ) {
    throw AppError.forbidden('You can only edit exams you created.');
  }

  Object.assign(exam, req.body);
  await exam.save();

  return sendSuccess(res, 200, 'Exam updated', { exam });
};

// @desc    Delete an exam
// @route   DELETE /api/v1/exams/:id
// @access  Admin, Teacher (own)
const deleteExam = async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  if (!exam) throw AppError.notFound('Exam not found');

  if (
    req.user.role === 'Teacher' &&
    String(exam.teacher) !== String(req.user._id)
  ) {
    throw AppError.forbidden('You can only delete exams you created.');
  }

  await exam.deleteOne();

  return sendSuccess(res, 200, 'Exam deleted');
};

module.exports = { getExams, createExam, updateExam, deleteExam };
