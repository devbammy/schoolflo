const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
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
} = require('../controllers/calendarController');
const {
  createCalendarRules,
  calendarEventRules,
  idParam,
} = require('../validators/operationsValidators');
const { objectIdParam } = require('../validators/common');

const eventParams = [
  objectIdParam('id', 'Calendar id'),
  objectIdParam('eventId', 'Event id'),
];

router.get('/', protect, getCalendars);

// Must precede '/:id' so 'active' is never treated as an id.
router.get('/active', protect, getActiveCalendar);

router.get('/:id', protect, validate(idParam), getCalendarById);

router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(createCalendarRules),
  createCalendar,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  updateCalendar,
);

router.post(
  '/:id/event',
  protect,
  authorize('Admin'),
  validate([...idParam, ...calendarEventRules]),
  addEvent,
);

router.put(
  '/:id/event/:eventId',
  protect,
  authorize('Admin'),
  validate(eventParams),
  updateEvent,
);

router.delete(
  '/:id/event/:eventId',
  protect,
  authorize('Admin'),
  validate(eventParams),
  deleteEvent,
);

router.patch(
  '/:id/publish',
  protect,
  authorize('Admin'),
  validate(idParam),
  publishCalendar,
);

router.patch(
  '/:id/activate',
  protect,
  authorize('Admin'),
  validate(idParam),
  activateCalendar,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deleteCalendar,
);

module.exports = router;
