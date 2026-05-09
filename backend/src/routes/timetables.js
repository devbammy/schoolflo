const express = require('express');
const router = express.Router();
const Timetable = require('../models/Timetable');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// ── Populate helper ───────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /timetables
// Admin: returns all timetables (optionally filtered)
// Teacher/Student/Parent: filtered by their context — see GET /timetables/mine
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, authorize('Admin'), async (req, res) => {
  try {
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
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /timetables/mine
// Contextual — returns the relevant timetable for the current user:
//   Teacher  → timetable(s) where they appear in any period OR are class teacher
//   Student  → timetable for their class
//   Parent   → timetables for all their children's classes
// ─────────────────────────────────────────────────────────────────────────────
router.get('/mine', protect, async (req, res) => {
  try {
    const { user } = req;
    const { term, academicYear } = req.query;

    // Get current academic year if not provided
    const currentYear = new Date().getFullYear();
    const defaultAcademicYear = `${currentYear}/${currentYear + 1}`;

    const baseFilter = { isPublished: true };
    if (term) baseFilter.term = term;
    // Use provided academicYear or default to current year
    baseFilter.academicYear = academicYear || defaultAcademicYear;

    let timetables = [];

    if (user.role === 'Teacher') {
      // All timetables where this teacher teaches at least one period OR is the class teacher
      const teacherProfile = user.teacherProfile || {};
      timetables = await Timetable.find({
        ...baseFilter,
        $or: [
          { 'periods.teacher': user._id }, // Teaches a specific period
          { class: teacherProfile.classTeacherOf }, // Is the class teacher
        ],
      }).populate(BASE_POPULATE);
    } else if (user.role === 'Student') {
      const classId = user.studentProfile?.class;
      if (!classId)
        return sendSuccess(res, 200, 'No class assigned', { timetables: [] });

      timetables = await Timetable.find({
        ...baseFilter,
        class: classId,
      }).populate(BASE_POPULATE);
    } else if (user.role === 'Parent') {
      const fullUser = await User.findById(user._id).populate(
        'parentProfile.children',
        'studentProfile',
      );

      const classIds = (fullUser.parentProfile?.children || [])
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
      // Admin can use /mine to get everything for the current term
      timetables = await Timetable.find(baseFilter)
        .populate(BASE_POPULATE)
        .sort({ class: 1 });
    }

    return sendSuccess(res, 200, 'Timetables fetched', { timetables });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /timetables/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.id).populate(
      BASE_POPULATE,
    );

    if (!timetable) return sendError(res, 404, 'Timetable not found');

    // Non-admins can only see published timetables
    if (req.user.role !== 'Admin' && !timetable.isPublished) {
      return sendError(res, 403, 'This timetable has not been published yet');
    }

    return sendSuccess(res, 200, 'Timetable fetched', { timetable });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /timetables  — create a new timetable (skeleton, no periods yet)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const { class: classId, section, term, academicYear, notes } = req.body;

    const existing = await Timetable.findOne({
      class: classId,
      section: section || '',
      term,
      academicYear,
    });
    if (existing) {
      return sendError(
        res,
        409,
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
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /timetables/:id  — replace the full periods array
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const { periods, notes, isPublished } = req.body;

    const timetable = await Timetable.findById(req.params.id);
    if (!timetable) return sendError(res, 404, 'Timetable not found');

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
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /timetables/:id/period  — upsert a single period (day + periodNumber)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/period', protect, authorize('Admin'), async (req, res) => {
  try {
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
      return sendError(res, 400, 'day and periodNumber are required');
    }

    const timetable = await Timetable.findById(req.params.id);
    if (!timetable) return sendError(res, 404, 'Timetable not found');

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
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /timetables/:id/period/delete  — remove a single period
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  '/:id/period/delete',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const { day, periodNumber } = req.body;
      const timetable = await Timetable.findById(req.params.id);
      if (!timetable) return sendError(res, 404, 'Timetable not found');

      timetable.periods = timetable.periods.filter(
        (p) => !(p.day === day && p.periodNumber === periodNumber),
      );
      timetable.lastEditedBy = req.user._id;
      await timetable.save();

      return sendSuccess(res, 200, 'Period removed', {
        periodCount: timetable.periods.length,
      });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /timetables/:id/publish
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/publish', protect, authorize('Admin'), async (req, res) => {
  try {
    const timetable = await Timetable.findById(req.params.id).populate(
      'class',
      'name',
    );

    if (!timetable) return sendError(res, 404, 'Timetable not found');
    if (timetable.periods.length === 0) {
      return sendError(
        res,
        400,
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
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /timetables/:id/unpublish
// ─────────────────────────────────────────────────────────────────────────────
router.patch(
  '/:id/unpublish',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const timetable = await Timetable.findByIdAndUpdate(
        req.params.id,
        { isPublished: false, lastEditedBy: req.user._id },
        { new: true },
      );
      if (!timetable) return sendError(res, 404, 'Timetable not found');
      return sendSuccess(res, 200, 'Timetable unpublished', { timetable });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /timetables/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    await Timetable.findByIdAndDelete(req.params.id);
    return sendSuccess(res, 200, 'Timetable deleted');
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

module.exports = router;
