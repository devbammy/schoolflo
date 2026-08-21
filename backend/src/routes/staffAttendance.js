const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getToday,
  clockIn,
  clockOut,
  getMyAttendance,
  getAllAttendance,
  getDailyRoster,
  getStaffSummary,
  markAttendance,
  updateAttendance,
  deleteAttendance,
} = require('../controllers/staffAttendanceController');
const {
  idParam,
  clockRules,
  listRules,
  myAttendanceRules,
  dailyRosterRules,
  summaryRules,
  markRules,
  updateRules,
} = require('../validators/staffAttendanceValidators');

// Staff-only throughout. Students and parents have no view of who was on site.
router.use(protect, authorize('Admin', 'Teacher'));

// ── The staff member's own clock ────────────────────────────────────────────
// Always about req.user: there is no endpoint that clocks somebody else in,
// which is the whole point of a clock.
router.get('/today', getToday);
router.post('/clock-in', validate(clockRules), clockIn);
router.post('/clock-out', validate(clockRules), clockOut);
router.get('/me', validate(myAttendanceRules), getMyAttendance);

// ── The admin's oversight ───────────────────────────────────────────────────
// These named routes precede '/:id' so none of them is ever read as an id.
router.get(
  '/daily',
  authorize('Admin'),
  validate(dailyRosterRules),
  getDailyRoster,
);

router.get(
  '/summary',
  authorize('Admin'),
  validate(summaryRules),
  getStaffSummary,
);

router.get('/', authorize('Admin'), validate(listRules), getAllAttendance);

router.post('/mark', authorize('Admin'), validate(markRules), markAttendance);

router.patch(
  '/:id',
  authorize('Admin'),
  validate(updateRules),
  updateAttendance,
);

router.delete('/:id', authorize('Admin'), validate(idParam), deleteAttendance);

module.exports = router;
