const Timetable = require('../models/Timetable');
const User = require('../models/User');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');

const PERIOD_POPULATE = [
  { path: 'periods.subject', select: 'name code' },
  { path: 'periods.teacher', select: 'firstName lastName' },
];

const BASE_POPULATE = [
  { path: 'class', select: 'name level' },
  { path: 'createdBy', select: 'firstName lastName' },
  { path: 'lastEditedBy', select: 'firstName lastName' },
  ...PERIOD_POPULATE,
];

const findTimetableOr404 = async (id) => {
  const timetable = await Timetable.findById(id);
  if (!timetable) throw AppError.notFound('Timetable not found');
  return timetable;
};

// @desc    List timetables
// @route   GET /api/v1/timetables
// @access  Admin
const getTimetables = async (req, res) => {
  const { classId, term, academicYear, isPublished } = req.query;

  const filter = {};
  if (classId) filter.class = classId;
  if (term) filter.term = term;
  if (academicYear) filter.academicYear = academicYear;
  if (isPublished !== undefined) filter.isPublished = isPublished === 'true';

  const timetables = await Timetable.find(filter)
    .populate(BASE_POPULATE)
    .sort({ class: 1, term: 1 });

  return sendSuccess(res, 200, 'Timetables fetched', {
    timetables,
    count: timetables.length,
  });
};

// @desc    The timetables relevant to the caller
// @route   GET /api/v1/timetables/mine
// @access  Any authenticated user
//
//   Teacher → where they teach a period, or are the form teacher
//   Student → their own class
//   Parent  → their children's classes
//   Admin   → everything for the term
const getMyTimetables = async (req, res) => {
  const { user } = req;
  const { term, academicYear } = req.query;

  const currentYear = new Date().getFullYear();
  const defaultAcademicYear = `${currentYear}/${currentYear + 1}`;

  const baseFilter = { isPublished: true };
  if (term) baseFilter.term = term;
  baseFilter.academicYear = academicYear || defaultAcademicYear;

  let timetables = [];

  if (user.role === 'Teacher') {
    const teacherProfile = user.teacherProfile || {};
    const or = [{ 'periods.teacher': user._id }];

    // Only add the class-teacher clause when there is one; `class: undefined`
    // would otherwise match timetables with no class set.
    if (teacherProfile.classTeacherOf) {
      or.push({ class: teacherProfile.classTeacherOf });
    }

    timetables = await Timetable.find({ ...baseFilter, $or: or }).populate(
      BASE_POPULATE,
    );
  } else if (user.role === 'Student') {
    const classId = user.studentProfile?.class;
    if (!classId) {
      return sendSuccess(res, 200, 'No class assigned', { timetables: [] });
    }

    timetables = await Timetable.find({
      ...baseFilter,
      class: classId,
    }).populate(BASE_POPULATE);
  } else if (user.role === 'Parent') {
    const fullUser = await User.findById(user._id).populate(
      'parentProfile.children',
      'studentProfile',
    );

    const classIds = (fullUser?.parentProfile?.children || [])
      .map((c) => c.studentProfile?.class)
      .filter(Boolean);

    if (!classIds.length) {
      return sendSuccess(res, 200, 'No children found', { timetables: [] });
    }

    timetables = await Timetable.find({
      ...baseFilter,
      class: { $in: classIds },
    }).populate(BASE_POPULATE);
  } else if (user.role === 'Admin') {
    timetables = await Timetable.find(baseFilter)
      .populate(BASE_POPULATE)
      .sort({ class: 1 });
  }

  return sendSuccess(res, 200, 'Timetables fetched', { timetables });
};

// @desc    Get one timetable
// @route   GET /api/v1/timetables/:id
// @access  Any authenticated user (drafts are Admin-only)
const getTimetableById = async (req, res) => {
  const timetable = await Timetable.findById(req.params.id).populate(
    BASE_POPULATE,
  );

  if (!timetable) throw AppError.notFound('Timetable not found');

  if (req.user.role !== 'Admin' && !timetable.isPublished) {
    throw AppError.forbidden('This timetable has not been published yet');
  }

  return sendSuccess(res, 200, 'Timetable fetched', { timetable });
};

// @desc    Create an empty timetable
// @route   POST /api/v1/timetables
// @access  Admin
const createTimetable = async (req, res) => {
  const { class: classId, section, term, academicYear, notes } = req.body;

  const existing = await Timetable.findOne({
    class: classId,
    section: section || '',
    term,
    academicYear,
  });

  if (existing) {
    throw AppError.conflict(
      `A timetable for this class/term/year already exists (id: ${existing._id}). Use PUT to update it.`,
    );
  }

  const timetable = await Timetable.create({
    class: classId,
    section: section || '',
    term,
    academicYear,
    notes: notes || '',
    periods: [],
    createdBy: req.user._id,
  });

  await timetable.populate(BASE_POPULATE);

  return sendSuccess(res, 201, 'Timetable created', { timetable });
};

// @desc    Replace the whole periods array
// @route   PUT /api/v1/timetables/:id
// @access  Admin
const updateTimetable = async (req, res) => {
  const { periods, notes, isPublished } = req.body;

  const timetable = await findTimetableOr404(req.params.id);

  if (periods !== undefined) timetable.periods = periods;
  if (notes !== undefined) timetable.notes = notes;
  if (isPublished !== undefined) {
    timetable.isPublished = isPublished;
    if (isPublished && !timetable.publishedAt) {
      timetable.publishedAt = new Date();
    }
  }
  timetable.lastEditedBy = req.user._id;

  await timetable.save();
  await timetable.populate(BASE_POPULATE);

  return sendSuccess(res, 200, 'Timetable updated', { timetable });
};

// @desc    Add or replace one period, keyed on day + periodNumber
// @route   PATCH /api/v1/timetables/:id/period
// @access  Admin
const upsertPeriod = async (req, res) => {
  const {
    day,
    periodNumber,
    startTime,
    endTime,
    subject,
    teacher,
    room,
    isBreak,
    breakLabel,
  } = req.body;

  if (!day || !periodNumber) {
    throw AppError.badRequest('day and periodNumber are required');
  }

  const timetable = await findTimetableOr404(req.params.id);

  const idx = timetable.periods.findIndex(
    (p) => p.day === day && p.periodNumber === periodNumber,
  );

  const periodData = {
    day,
    periodNumber,
    startTime,
    endTime,
    subject: subject || null,
    teacher: teacher || null,
    room: room || '',
    isBreak: !!isBreak,
    breakLabel: breakLabel || '',
  };

  if (idx > -1) {
    timetable.periods[idx] = {
      ...timetable.periods[idx].toObject(),
      ...periodData,
    };
  } else {
    timetable.periods.push(periodData);
  }

  timetable.lastEditedBy = req.user._id;
  await timetable.save();
  await timetable.populate(BASE_POPULATE);

  return sendSuccess(res, 200, 'Period saved', { timetable });
};

// @desc    Remove one period
// @route   PATCH /api/v1/timetables/:id/period/delete
// @access  Admin
const deletePeriod = async (req, res) => {
  const { day, periodNumber } = req.body;

  const timetable = await findTimetableOr404(req.params.id);

  timetable.periods = timetable.periods.filter(
    (p) => !(p.day === day && p.periodNumber === periodNumber),
  );
  timetable.lastEditedBy = req.user._id;
  await timetable.save();

  return sendSuccess(res, 200, 'Period removed', {
    periodCount: timetable.periods.length,
  });
};

// @desc    Publish a timetable
// @route   PATCH /api/v1/timetables/:id/publish
// @access  Admin
const publishTimetable = async (req, res) => {
  const timetable = await Timetable.findById(req.params.id).populate(
    'class',
    'name',
  );

  if (!timetable) throw AppError.notFound('Timetable not found');

  if (timetable.periods.length === 0) {
    throw AppError.badRequest(
      'Cannot publish an empty timetable — add periods first',
    );
  }

  timetable.isPublished = true;
  timetable.publishedAt = new Date();
  timetable.lastEditedBy = req.user._id;
  await timetable.save();

  return sendSuccess(
    res,
    200,
    `Timetable for ${timetable.class?.name} published successfully`,
    { timetable },
  );
};

// @desc    Unpublish a timetable
// @route   PATCH /api/v1/timetables/:id/unpublish
// @access  Admin
const unpublishTimetable = async (req, res) => {
  const timetable = await Timetable.findByIdAndUpdate(
    req.params.id,
    { isPublished: false, lastEditedBy: req.user._id },
    { new: true },
  );

  if (!timetable) throw AppError.notFound('Timetable not found');

  return sendSuccess(res, 200, 'Timetable unpublished', { timetable });
};

// @desc    Delete a timetable
// @route   DELETE /api/v1/timetables/:id
// @access  Admin
const deleteTimetable = async (req, res) => {
  const timetable = await Timetable.findByIdAndDelete(req.params.id);
  if (!timetable) throw AppError.notFound('Timetable not found');

  return sendSuccess(res, 200, 'Timetable deleted');
};

module.exports = {
  getTimetables,
  getMyTimetables,
  getTimetableById,
  createTimetable,
  updateTimetable,
  upsertPeriod,
  deletePeriod,
  publishTimetable,
  unpublishTimetable,
  deleteTimetable,
};
