const express = require('express');
const router = express.Router();
const AcademicCalendar = require('../models/AcademicCalendar');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const POPULATE = [
  { path: 'createdBy', select: 'firstName lastName' },
  { path: 'lastEditedBy', select: 'firstName lastName' },
];

// ─────────────────────────────────────────────────────────────────────────────
// GET /calendar  — list all calendars (admin) or just published (others)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const filter = req.user.role === 'Admin' ? {} : { isPublished: true };
    const calendars = await AcademicCalendar.find(filter)
      .populate(POPULATE)
      .sort({ academicYear: -1 });
    return sendSuccess(res, 200, 'Calendars fetched', { calendars });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /calendar/active  — the currently active academic calendar
// ─────────────────────────────────────────────────────────────────────────────
router.get('/active', protect, async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.user.role !== 'Admin') filter.isPublished = true;

    const calendar = await AcademicCalendar.findOne(filter).populate(POPULATE);
    if (!calendar)
      return sendSuccess(res, 200, 'No active calendar', { calendar: null });
    return sendSuccess(res, 200, 'Active calendar fetched', { calendar });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /calendar/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const calendar = await AcademicCalendar.findById(req.params.id).populate(
      POPULATE,
    );
    if (!calendar) return sendError(res, 404, 'Calendar not found');
    if (req.user.role !== 'Admin' && !calendar.isPublished) {
      return sendError(res, 403, 'Calendar not yet published');
    }
    return sendSuccess(res, 200, 'Calendar fetched', { calendar });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /calendar  — create a new academic year calendar
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const { academicYear, sessionStartDate, sessionEndDate, terms, notes } =
      req.body;

    const existing = await AcademicCalendar.findOne({ academicYear });
    if (existing)
      return sendError(res, 409, `Calendar for ${academicYear} already exists`);

    const calendar = await AcademicCalendar.create({
      academicYear,
      sessionStartDate,
      sessionEndDate,
      terms: terms || [],
      events: [],
      notes: notes || '',
      createdBy: req.user._id,
    });

    return sendSuccess(res, 201, 'Academic calendar created', { calendar });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /calendar/:id  — update the skeleton (year, session dates, terms, notes)
// ─────────────────────────────────────────────────────────────────────────────
router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const { academicYear, sessionStartDate, sessionEndDate, terms, notes } =
      req.body;
    const calendar = await AcademicCalendar.findById(req.params.id);
    if (!calendar) return sendError(res, 404, 'Calendar not found');

    if (academicYear) calendar.academicYear = academicYear;
    if (sessionStartDate) calendar.sessionStartDate = sessionStartDate;
    if (sessionEndDate) calendar.sessionEndDate = sessionEndDate;
    if (terms) calendar.terms = terms;
    if (notes !== undefined) calendar.notes = notes;
    calendar.lastEditedBy = req.user._id;

    await calendar.save();
    return sendSuccess(res, 200, 'Calendar updated', { calendar });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /calendar/:id/event  — add an event to the calendar
// ─────────────────────────────────────────────────────────────────────────────
router.post('/:id/event', protect, authorize('Admin'), async (req, res) => {
  try {
    const calendar = await AcademicCalendar.findById(req.params.id);
    if (!calendar) return sendError(res, 404, 'Calendar not found');

    const {
      title,
      type,
      startDate,
      endDate,
      isAllDay,
      description,
      targetAudience,
      color,
    } = req.body;
    if (!title || !startDate)
      return sendError(res, 400, 'title and startDate are required');

    calendar.events.push({
      title,
      type,
      startDate,
      endDate: endDate || startDate,
      isAllDay: isAllDay !== false,
      description: description || '',
      targetAudience: targetAudience || ['All'],
      color: color || '',
    });
    calendar.lastEditedBy = req.user._id;
    await calendar.save();

    return sendSuccess(res, 201, 'Event added', {
      event: calendar.events[calendar.events.length - 1],
    });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /calendar/:id/event/:eventId  — edit an event
// ─────────────────────────────────────────────────────────────────────────────
router.put(
  '/:id/event/:eventId',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const calendar = await AcademicCalendar.findById(req.params.id);
      if (!calendar) return sendError(res, 404, 'Calendar not found');

      const event = calendar.events.id(req.params.eventId);
      if (!event) return sendError(res, 404, 'Event not found');

      const fields = [
        'title',
        'type',
        'startDate',
        'endDate',
        'isAllDay',
        'description',
        'targetAudience',
        'color',
      ];
      fields.forEach((f) => {
        if (req.body[f] !== undefined) event[f] = req.body[f];
      });
      calendar.lastEditedBy = req.user._id;
      await calendar.save();

      return sendSuccess(res, 200, 'Event updated', { event });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /calendar/:id/event/:eventId
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id/event/:eventId',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const calendar = await AcademicCalendar.findById(req.params.id);
      if (!calendar) return sendError(res, 404, 'Calendar not found');

      calendar.events = calendar.events.filter(
        (e) => String(e._id) !== req.params.eventId,
      );
      calendar.lastEditedBy = req.user._id;
      await calendar.save();

      return sendSuccess(res, 200, 'Event deleted');
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /calendar/:id/publish
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/publish', protect, authorize('Admin'), async (req, res) => {
  try {
    const calendar = await AcademicCalendar.findById(req.params.id);
    if (!calendar) return sendError(res, 404, 'Calendar not found');

    calendar.isPublished = true;
    calendar.publishedAt = new Date();
    calendar.lastEditedBy = req.user._id;
    await calendar.save();

    return sendSuccess(res, 200, 'Calendar published', { calendar });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /calendar/:id/activate  — set as current active session (unpublishes others)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/:id/activate', protect, authorize('Admin'), async (req, res) => {
  try {
    // Deactivate all others first
    await AcademicCalendar.updateMany(
      { _id: { $ne: req.params.id } },
      { isActive: false },
    );

    const calendar = await AcademicCalendar.findByIdAndUpdate(
      req.params.id,
      { isActive: true, lastEditedBy: req.user._id },
      { new: true },
    );
    if (!calendar) return sendError(res, 404, 'Calendar not found');

    return sendSuccess(
      res,
      200,
      `${calendar.academicYear} set as active session`,
      { calendar },
    );
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /calendar/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const cal = await AcademicCalendar.findById(req.params.id);
    if (!cal) return sendError(res, 404, 'Calendar not found');
    if (cal.isActive)
      return sendError(
        res,
        400,
        'Cannot delete the active calendar. Activate another first.',
      );
    await cal.deleteOne();
    return sendSuccess(res, 200, 'Calendar deleted');
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

module.exports = router;
