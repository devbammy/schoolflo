const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
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
} = require('../controllers/timetableController');
const {
  timetableRules,
  idParam,
} = require('../validators/operationsValidators');

router.get('/', protect, authorize('Admin'), getTimetables);

// Must precede '/:id' so 'mine' is never treated as an id.
router.get('/mine', protect, getMyTimetables);

router.get('/:id', protect, validate(idParam), getTimetableById);

router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(timetableRules),
  createTimetable,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  updateTimetable,
);

// '/:id/period/delete' must be registered before '/:id/period' so the longer
// path is not shadowed.
router.patch(
  '/:id/period/delete',
  protect,
  authorize('Admin'),
  validate(idParam),
  deletePeriod,
);

router.patch(
  '/:id/period',
  protect,
  authorize('Admin'),
  validate(idParam),
  upsertPeriod,
);

router.patch(
  '/:id/publish',
  protect,
  authorize('Admin'),
  validate(idParam),
  publishTimetable,
);

router.patch(
  '/:id/unpublish',
  protect,
  authorize('Admin'),
  validate(idParam),
  unpublishTimetable,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deleteTimetable,
);

module.exports = router;
