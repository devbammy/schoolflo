const AcademicCalendar = require('../models/AcademicCalendar');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');

const POPULATE = [
  { path: 'createdBy', select: 'firstName lastName' },
  { path: 'lastEditedBy', select: 'firstName lastName' },
];

// Fields an event exposes for editing.
const EVENT_FIELDS = [
  'title',
  'type',
  'startDate',
  'endDate',
  'isAllDay',
  'description',
  'targetAudience',
  'color',
];

/** Load a calendar or fail with a 404. */
const findCalendarOr404 = async (id) => {
  const calendar = await AcademicCalendar.findById(id);
  if (!calendar) throw AppError.notFound('Calendar not found');
  return calendar;
};

// @desc    List calendars — everyone sees published, Admin sees drafts too
// @route   GET /api/v1/calendar
// @access  Any authenticated user
const getCalendars = async (req, res) => {
  const filter = req.user.role === 'Admin' ? {} : { isPublished: true };

  const calendars = await AcademicCalendar.find(filter)
    .populate(POPULATE)
    .sort({ academicYear: -1 });

  return sendSuccess(res, 200, 'Calendars fetched', { calendars });
};

// @desc    The currently active academic calendar
// @route   GET /api/v1/calendar/active
// @access  Any authenticated user
const getActiveCalendar = async (req, res) => {
  const filter = { isActive: true };
  if (req.user.role !== 'Admin') filter.isPublished = true;

  const calendar = await AcademicCalendar.findOne(filter).populate(POPULATE);

  if (!calendar) {
    return sendSuccess(res, 200, 'No active calendar', { calendar: null });
  }

  return sendSuccess(res, 200, 'Active calendar fetched', { calendar });
};

// @desc    Get one calendar
// @route   GET /api/v1/calendar/:id
// @access  Any authenticated user (drafts are Admin-only)
const getCalendarById = async (req, res) => {
  const calendar = await AcademicCalendar.findById(req.params.id).populate(
    POPULATE,
  );

  if (!calendar) throw AppError.notFound('Calendar not found');

  if (req.user.role !== 'Admin' && !calendar.isPublished) {
    throw AppError.forbidden('Calendar not yet published');
  }

  return sendSuccess(res, 200, 'Calendar fetched', { calendar });
};

// @desc    Create an academic year calendar
// @route   POST /api/v1/calendar
// @access  Admin
const createCalendar = async (req, res) => {
  const { academicYear, sessionStartDate, sessionEndDate, terms, notes } =
    req.body;

  const existing = await AcademicCalendar.findOne({ academicYear });
  if (existing) {
    throw AppError.conflict(`Calendar for ${academicYear} already exists`);
  }

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
};

// @desc    Update a calendar's skeleton
// @route   PUT /api/v1/calendar/:id
// @access  Admin
const updateCalendar = async (req, res) => {
  const { academicYear, sessionStartDate, sessionEndDate, terms, notes } =
    req.body;

  const calendar = await findCalendarOr404(req.params.id);

  if (academicYear) calendar.academicYear = academicYear;
  if (sessionStartDate) calendar.sessionStartDate = sessionStartDate;
  if (sessionEndDate) calendar.sessionEndDate = sessionEndDate;
  if (terms) calendar.terms = terms;
  if (notes !== undefined) calendar.notes = notes;
  calendar.lastEditedBy = req.user._id;

  await calendar.save();

  return sendSuccess(res, 200, 'Calendar updated', { calendar });
};

// @desc    Add an event to a calendar
// @route   POST /api/v1/calendar/:id/event
// @access  Admin
const addEvent = async (req, res) => {
  const calendar = await findCalendarOr404(req.params.id);

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
};

// @desc    Edit an event
// @route   PUT /api/v1/calendar/:id/event/:eventId
// @access  Admin
const updateEvent = async (req, res) => {
  const calendar = await findCalendarOr404(req.params.id);

  const event = calendar.events.id(req.params.eventId);
  if (!event) throw AppError.notFound('Event not found');

  EVENT_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) event[field] = req.body[field];
  });

  calendar.lastEditedBy = req.user._id;
  await calendar.save();

  return sendSuccess(res, 200, 'Event updated', { event });
};

// @desc    Delete an event
// @route   DELETE /api/v1/calendar/:id/event/:eventId
// @access  Admin
const deleteEvent = async (req, res) => {
  const calendar = await findCalendarOr404(req.params.id);

  const before = calendar.events.length;
  calendar.events = calendar.events.filter(
    (e) => String(e._id) !== req.params.eventId,
  );

  if (calendar.events.length === before) {
    throw AppError.notFound('Event not found');
  }

  calendar.lastEditedBy = req.user._id;
  await calendar.save();

  return sendSuccess(res, 200, 'Event deleted');
};

// @desc    Publish a calendar
// @route   PATCH /api/v1/calendar/:id/publish
// @access  Admin
const publishCalendar = async (req, res) => {
  const calendar = await findCalendarOr404(req.params.id);

  calendar.isPublished = true;
  calendar.publishedAt = new Date();
  calendar.lastEditedBy = req.user._id;
  await calendar.save();

  return sendSuccess(res, 200, 'Calendar published', { calendar });
};

// @desc    Make a calendar the active session
// @route   PATCH /api/v1/calendar/:id/activate
// @access  Admin
const activateCalendar = async (req, res) => {
  // Confirm the target exists before standing every other calendar down.
  const target = await findCalendarOr404(req.params.id);

  await AcademicCalendar.updateMany(
    { _id: { $ne: target._id } },
    { isActive: false },
  );

  const calendar = await AcademicCalendar.findByIdAndUpdate(
    target._id,
    { isActive: true, lastEditedBy: req.user._id },
    { new: true },
  );

  return sendSuccess(
    res,
    200,
    `${calendar.academicYear} set as active session`,
    { calendar },
  );
};

// @desc    Delete a calendar
// @route   DELETE /api/v1/calendar/:id
// @access  Admin
const deleteCalendar = async (req, res) => {
  const calendar = await findCalendarOr404(req.params.id);

  // Removing the active session would leave the school with no calendar in
  // effect, so another must be activated first.
  if (calendar.isActive) {
    throw AppError.badRequest(
      'Cannot delete the active calendar. Activate another first.',
    );
  }

  await calendar.deleteOne();

  return sendSuccess(res, 200, 'Calendar deleted');
};

module.exports = {
  getCalendars,
  getActiveCalendar,
  getCalendarById,
  createCalendar,
  updateCalendar,
  addEvent,
  updateEvent,
  deleteEvent,
  publishCalendar,
  activateCalendar,
  deleteCalendar,
};
