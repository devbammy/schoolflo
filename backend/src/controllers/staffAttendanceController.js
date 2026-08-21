const StaffAttendance = require('../models/StaffAttendance');
const User = require('../models/User');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { ATTENDANCE_STATUS, STAFF_ATTENDANCE } = require('../config/constants');
const {
  today,
  dayKey,
  minutesIntoDay,
  parseClockTime,
  formatClockTime,
  dayKeyFromDateString,
  isWorkingDay,
  endOfDayKey,
} = require('../utils/schoolTime');

const STAFF_ROLES = ['Teacher', 'Admin'];

const POPULATE = [
  {
    path: 'staff',
    select: 'firstName lastName email avatar role teacherProfile.staffId',
  },
  { path: 'markedBy', select: 'firstName lastName role' },
];

/**
 * A day key from a 'YYYY-MM-DD' input, defaulting to today.
 *
 * The shape is enforced by the validator; this also rejects a date that has
 * the right shape but does not exist, such as 2026-02-31.
 */
const requestedDay = (value) => {
  if (!value) return today();

  const key = dayKeyFromDateString(value);
  if (!key) throw AppError.badRequest('Date must look like 2026-08-21.');

  return key;
};

/** A [from, to] day range from query params, either end optional. */
const requestedRange = ({ from, to }) => {
  const range = {};

  if (from) {
    const key = dayKeyFromDateString(from);
    if (!key) throw AppError.badRequest('"from" must look like 2026-08-21.');
    range.$gte = key;
  }

  if (to) {
    const key = dayKeyFromDateString(to);
    if (!key) throw AppError.badRequest('"to" must look like 2026-08-21.');
    // Inclusive of the whole closing day — what a person picking a date on a
    // filter means by "to".
    range.$lt = endOfDayKey(key);
  }

  if (range.$gte && range.$lt && range.$gte >= range.$lt) {
    throw AppError.badRequest('"from" must be on or before "to".');
  }

  return Object.keys(range).length ? range : null;
};

/** The configured working day, in the shape the client renders. */
const workDayInfo = () => {
  const workDay = StaffAttendance.workDay();

  return {
    start: workDay.startLabel,
    end: workDay.endLabel,
    graceMinutes: workDay.graceMinutes,
    // Sent so the client renders school time rather than device time. A
    // teacher checking the roster from a phone left on another timezone must
    // still see the times the school recorded.
    utcOffsetMinutes: STAFF_ATTENDANCE.TIMEZONE_OFFSET_MINUTES,
  };
};

/**
 * What the clock screen needs to render itself: the working day, today's
 * record if there is one, and which of the two buttons is live.
 */
const buildClockState = (record, day) => ({
  date: day,
  isWorkingDay: isWorkingDay(day),
  workDay: workDayInfo(),
  record: record || null,
  canClockIn: !record?.clockIn?.at,
  canClockOut: Boolean(record?.clockIn?.at && !record?.clockOut?.at),
});

/**
 * Turn a wall-clock string into an instant on a given day key.
 *
 * Anchored to the record's own day, so an admin fixing Monday's times cannot
 * accidentally move the record to today.
 */
const instantOnDay = (day, clockTime, label) => {
  const minutes = parseClockTime(clockTime);
  if (minutes === null)
    throw AppError.badRequest(`${label} must look like 08:30.`);

  return new Date(
    new Date(day).getTime() +
      (minutes - STAFF_ATTENDANCE.TIMEZONE_OFFSET_MINUTES) * 60000,
  );
};

// @desc    The caller's own clock state for today
// @route   GET /api/v1/staff-attendance/today
// @access  Admin, Teacher
const getToday = async (req, res) => {
  const day = today();

  const record = await StaffAttendance.findOne({
    staff: req.user._id,
    ...StaffAttendance.onDay(day),
  }).populate(POPULATE);

  return sendSuccess(
    res,
    200,
    'Clock state fetched',
    buildClockState(record, day),
  );
};

// @desc    Clock in for the day
// @route   POST /api/v1/staff-attendance/clock-in
// @access  Admin, Teacher
const clockIn = async (req, res) => {
  const now = new Date();
  const day = dayKey(now);
  const minutes = minutesIntoDay(now);
  const { start } = StaffAttendance.workDay();

  const existing = await StaffAttendance.findOne({
    staff: req.user._id,
    ...StaffAttendance.onDay(day),
  });

  if (existing?.clockIn?.at) {
    throw AppError.conflict(
      `You already clocked in today at ${formatClockTime(
        minutesIntoDay(existing.clockIn.at),
      )}.`,
    );
  }

  // An admin may have already recorded the day as leave. Clocking in over that
  // would quietly erase their decision.
  if (existing && existing.status === ATTENDANCE_STATUS.EXCUSED) {
    throw AppError.badRequest(
      'Today is recorded as excused leave. Ask an admin to change it before clocking in.',
    );
  }

  const status = StaffAttendance.statusForArrival(minutes);
  const minutesLate = Math.max(0, minutes - start);

  let record;

  try {
    // Upsert rather than create: an admin may have pre-marked the day absent,
    // and the unique index would reject a second document for the same day.
    record = await StaffAttendance.findOneAndUpdate(
      { staff: req.user._id, ...StaffAttendance.onDay(day) },
      {
        $set: {
          status,
          clockIn: {
            at: now,
            ip: req.ip,
            note: req.body.note || undefined,
            minutesLate,
          },
        },
        $setOnInsert: { staff: req.user._id, date: day, source: 'clock' },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      },
    ).populate(POPULATE);
  } catch (error) {
    // Two taps on the button at once: the loser of the race hits the unique
    // index. That is the correct outcome, phrased for a human.
    if (error.code === 11000) {
      throw AppError.conflict('You have already clocked in today.');
    }
    throw error;
  }

  await audit.record(req, {
    action: 'staff-attendance.clock-in',
    entity: 'StaffAttendance',
    entityId: record._id,
    entityLabel: `${req.user.firstName} ${req.user.lastName}`,
    subject: req.user._id,
    meta: { at: now, status, minutesLate },
  });

  return sendSuccess(
    res,
    existing ? 200 : 201,
    status === ATTENDANCE_STATUS.LATE
      ? `Clocked in at ${formatClockTime(minutes)} — recorded as late.`
      : `Clocked in at ${formatClockTime(minutes)}.`,
    buildClockState(record, day),
  );
};

// @desc    Clock out for the day
// @route   POST /api/v1/staff-attendance/clock-out
// @access  Admin, Teacher
const clockOut = async (req, res) => {
  const now = new Date();
  const day = dayKey(now);

  const record = await StaffAttendance.findOne({
    staff: req.user._id,
    ...StaffAttendance.onDay(day),
  });

  if (!record?.clockIn?.at) {
    throw AppError.badRequest('You have not clocked in today.');
  }

  if (record.clockOut?.at) {
    throw AppError.conflict(
      `You already clocked out today at ${formatClockTime(
        minutesIntoDay(record.clockOut.at),
      )}.`,
    );
  }

  record.clockOut = { at: now, ip: req.ip, note: req.body.note || undefined };
  record.workedMinutes = Math.max(
    0,
    Math.round((now - record.clockIn.at) / 60000),
  );

  await record.save();
  await record.populate(POPULATE);

  await audit.record(req, {
    action: 'staff-attendance.clock-out',
    entity: 'StaffAttendance',
    entityId: record._id,
    entityLabel: `${req.user.firstName} ${req.user.lastName}`,
    subject: req.user._id,
    meta: { at: now, workedMinutes: record.workedMinutes },
  });

  const hours = Math.floor(record.workedMinutes / 60);
  const mins = record.workedMinutes % 60;

  return sendSuccess(
    res,
    200,
    `Clocked out at ${formatClockTime(
      minutesIntoDay(now),
    )} — ${hours}h ${mins}m on site.`,
    buildClockState(record, day),
  );
};

// @desc    The caller's own attendance history
// @route   GET /api/v1/staff-attendance/me
// @access  Admin, Teacher
const getMyAttendance = async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = { staff: req.user._id };

  const range = requestedRange(req.query);
  if (range) filter.date = range;
  if (req.query.status) filter.status = req.query.status;

  const [records, total, summary] = await Promise.all([
    StaffAttendance.find(filter).sort({ date: -1 }).skip(skip).limit(limit),
    StaffAttendance.countDocuments(filter),
    StaffAttendance.getSummary(filter),
  ]);

  return sendPaginated(res, { records, summary }, total, page, limit);
};

// @desc    Every staff attendance record, filtered
// @route   GET /api/v1/staff-attendance
// @access  Admin
const getAllAttendance = async (req, res) => {
  const { page, limit, skip } = getPaginationParams(req.query);
  const { staff, status, date } = req.query;

  const filter = {};

  if (staff) filter.staff = staff;
  if (status) filter.status = status;

  if (date) {
    Object.assign(filter, StaffAttendance.onDay(requestedDay(date)));
  } else {
    const range = requestedRange(req.query);
    if (range) filter.date = range;
  }

  const [records, total, summary] = await Promise.all([
    StaffAttendance.find(filter)
      .populate(POPULATE)
      .sort({ date: -1, 'clockIn.at': 1 })
      .skip(skip)
      .limit(limit),
    StaffAttendance.countDocuments(filter),
    StaffAttendance.getSummary(filter),
  ]);

  return sendPaginated(res, { records, summary }, total, page, limit);
};

// @desc    One day's roster — every active staff member, present or not
// @route   GET /api/v1/staff-attendance/daily
// @access  Admin
const getDailyRoster = async (req, res) => {
  const day = requestedDay(req.query.date);

  const roleFilter = req.query.role
    ? { role: req.query.role }
    : { role: { $in: STAFF_ROLES } };

  const [staff, records] = await Promise.all([
    User.find({ ...roleFilter, isActive: true })
      .select('firstName lastName email avatar role teacherProfile.staffId')
      .sort({ lastName: 1, firstName: 1 }),
    StaffAttendance.find(StaffAttendance.onDay(day)).populate(POPULATE),
  ]);

  const byStaff = new Map(
    records.map((record) => [
      String(record.staff?._id || record.staff),
      record,
    ]),
  );

  // Staff with no record are reported as Absent but flagged `recorded: false`,
  // so an admin can tell "marked absent by the office" apart from "never
  // turned up and nobody accounted for them".
  const roster = staff.map((member) => {
    const record = byStaff.get(String(member._id));

    return {
      staff: member,
      recorded: Boolean(record),
      record: record || null,
      status: record ? record.status : ATTENDANCE_STATUS.ABSENT,
      clockInAt: record?.clockIn?.at || null,
      clockOutAt: record?.clockOut?.at || null,
      minutesLate: record?.clockIn?.minutesLate || 0,
      workedMinutes: record?.workedMinutes || 0,
      isOpen: Boolean(record?.clockIn?.at && !record?.clockOut?.at),
    };
  });

  const counts = roster.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      if (row.isOpen) acc.stillIn += 1;
      if (!row.recorded) acc.unaccounted += 1;
      return acc;
    },
    {
      [ATTENDANCE_STATUS.PRESENT]: 0,
      [ATTENDANCE_STATUS.ABSENT]: 0,
      [ATTENDANCE_STATUS.LATE]: 0,
      [ATTENDANCE_STATUS.EXCUSED]: 0,
      stillIn: 0,
      unaccounted: 0,
    },
  );

  return sendSuccess(res, 200, 'Daily roster fetched', {
    date: day,
    isWorkingDay: isWorkingDay(day),
    workDay: workDayInfo(),
    totalStaff: roster.length,
    counts,
    roster,
  });
};

// @desc    Per-staff totals over a date range
// @route   GET /api/v1/staff-attendance/summary
// @access  Admin
const getStaffSummary = async (req, res) => {
  const range = requestedRange(req.query);
  const match = range ? { date: range } : {};

  const countWhen = (status) => ({
    $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] },
  });

  const rows = await StaffAttendance.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$staff',
        days: { $sum: 1 },
        present: countWhen(ATTENDANCE_STATUS.PRESENT),
        late: countWhen(ATTENDANCE_STATUS.LATE),
        absent: countWhen(ATTENDANCE_STATUS.ABSENT),
        excused: countWhen(ATTENDANCE_STATUS.EXCUSED),
        workedMinutes: { $sum: '$workedMinutes' },
        lateMinutes: { $sum: '$clockIn.minutesLate' },
        lastSeen: { $max: '$clockIn.at' },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'staff',
      },
    },
    { $unwind: '$staff' },
    {
      $project: {
        _id: 0,
        staff: {
          _id: '$staff._id',
          firstName: '$staff.firstName',
          lastName: '$staff.lastName',
          email: '$staff.email',
          avatar: '$staff.avatar',
          role: '$staff.role',
          staffId: '$staff.teacherProfile.staffId',
        },
        days: 1,
        present: 1,
        late: 1,
        absent: 1,
        excused: 1,
        workedMinutes: 1,
        lateMinutes: 1,
        lastSeen: 1,
        // Late still counts as having turned up. A rate that treats lateness
        // and absence identically tells an admin nothing about either.
        attendanceRate: {
          $cond: [
            { $gt: ['$days', 0] },
            {
              $round: [
                {
                  $multiply: [
                    { $divide: [{ $add: ['$present', '$late'] }, '$days'] },
                    100,
                  ],
                },
                1,
              ],
            },
            0,
          ],
        },
      },
    },
    // Worst attendance first: the rows an admin opened this page to find.
    { $sort: { attendanceRate: 1, 'staff.lastName': 1 } },
  ]);

  return sendSuccess(res, 200, 'Staff attendance summary', {
    summary: rows,
    overall: await StaffAttendance.getSummary(match),
  });
};

// @desc    Record a staff member's day — leave, an absence, a missed clock-in
// @route   POST /api/v1/staff-attendance/mark
// @access  Admin
const markAttendance = async (req, res) => {
  const { staff, status, note, clockInAt, clockOutAt } = req.body;

  const day = requestedDay(req.body.date);

  if (day > today()) {
    throw AppError.badRequest(
      'Attendance cannot be recorded for a future date.',
    );
  }

  const member = await User.findOne({
    _id: staff,
    role: { $in: STAFF_ROLES },
    isActive: true,
  }).select('firstName lastName');

  if (!member) {
    throw AppError.badRequest('That staff member could not be found.');
  }

  const existing = await StaffAttendance.findOne({
    staff,
    ...StaffAttendance.onDay(day),
  });

  const before = existing
    ? { status: existing.status, adminNote: existing.adminNote }
    : {};

  // Absent and Excused contradict a clock-in, so the times go rather than
  // being left to tell a different story to whoever reads the row next.
  const clearsTimes =
    status === ATTENDANCE_STATUS.ABSENT || status === ATTENDANCE_STATUS.EXCUSED;

  const set = {
    status,
    adminNote: note || undefined,
    markedBy: req.user._id,
    source: 'admin',
  };

  const unset = {};

  if (clearsTimes) {
    set.workedMinutes = 0;
    unset.clockIn = '';
    unset.clockOut = '';
  } else if (clockInAt) {
    // Filling in for somebody who was here but never touched the clock.
    const inAt = instantOnDay(day, clockInAt, 'Clock-in time');
    const { start } = StaffAttendance.workDay();

    set.clockIn = {
      at: inAt,
      note: note || undefined,
      minutesLate: Math.max(0, minutesIntoDay(inAt) - start),
    };

    if (clockOutAt) {
      const outAt = instantOnDay(day, clockOutAt, 'Clock-out time');

      if (outAt <= inAt) {
        throw AppError.badRequest('Clock-out must be after clock-in.');
      }

      set.clockOut = { at: outAt, note: note || undefined };
      set.workedMinutes = Math.round((outAt - inAt) / 60000);
    }
  }

  const update = {
    $set: set,
    $setOnInsert: { staff, date: day },
  };

  if (Object.keys(unset).length) update.$unset = unset;

  const record = await StaffAttendance.findOneAndUpdate(
    { staff, ...StaffAttendance.onDay(day) },
    update,
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  ).populate(POPULATE);

  await audit.record(req, {
    action: 'staff-attendance.mark',
    entity: 'StaffAttendance',
    entityId: record._id,
    entityLabel: `${member.firstName} ${member.lastName}`,
    subject: member._id,
    changes: audit.diff(before, { status, adminNote: note }),
    meta: {
      date: day,
      clearedClockTimes: clearsTimes && Boolean(existing?.clockIn?.at),
    },
  });

  return sendSuccess(
    res,
    existing ? 200 : 201,
    `${member.firstName} ${member.lastName} recorded as ${status}.`,
    { record },
  );
};

// @desc    Correct a record — a wrong status, or a clock-out nobody made
// @route   PATCH /api/v1/staff-attendance/:id
// @access  Admin
const updateAttendance = async (req, res) => {
  const record = await StaffAttendance.findById(req.params.id);

  if (!record) throw AppError.notFound('Attendance record not found');

  const before = {
    status: record.status,
    clockIn: record.clockIn?.at,
    clockOut: record.clockOut?.at,
    adminNote: record.adminNote,
  };

  if (req.body.status) record.status = req.body.status;
  if (req.body.note !== undefined) record.adminNote = req.body.note;

  if (req.body.clockInAt) {
    record.clockIn.at = instantOnDay(
      record.date,
      req.body.clockInAt,
      'Clock-in time',
    );

    const { start } = StaffAttendance.workDay();
    record.clockIn.minutesLate = Math.max(
      0,
      minutesIntoDay(record.clockIn.at) - start,
    );
  }

  if (req.body.clockOutAt) {
    if (!record.clockIn?.at) {
      throw AppError.badRequest(
        'Set a clock-in time before setting a clock-out time.',
      );
    }

    record.clockOut.at = instantOnDay(
      record.date,
      req.body.clockOutAt,
      'Clock-out time',
    );

    if (record.clockOut.at <= record.clockIn.at) {
      throw AppError.badRequest('Clock-out must be after clock-in.');
    }
  }

  if (record.clockIn?.at && record.clockOut?.at) {
    record.workedMinutes = Math.max(
      0,
      Math.round((record.clockOut.at - record.clockIn.at) / 60000),
    );
  }

  record.markedBy = req.user._id;
  record.source = 'admin';

  await record.save();
  await record.populate(POPULATE);

  await audit.record(req, {
    action: 'staff-attendance.update',
    entity: 'StaffAttendance',
    entityId: record._id,
    entityLabel:
      `${record.staff?.firstName || ''} ${record.staff?.lastName || ''}`.trim(),
    subject: record.staff?._id || record.staff,
    changes: audit.diff(before, {
      status: record.status,
      clockIn: record.clockIn?.at,
      clockOut: record.clockOut?.at,
      adminNote: record.adminNote,
    }),
  });

  return sendSuccess(res, 200, 'Attendance record updated', { record });
};

// @desc    Delete a record entered in error
// @route   DELETE /api/v1/staff-attendance/:id
// @access  Admin
const deleteAttendance = async (req, res) => {
  const record = await StaffAttendance.findById(req.params.id).populate(
    POPULATE,
  );

  if (!record) throw AppError.notFound('Attendance record not found');

  await record.deleteOne();

  await audit.record(req, {
    action: 'staff-attendance.delete',
    entity: 'StaffAttendance',
    entityId: record._id,
    entityLabel:
      `${record.staff?.firstName || ''} ${record.staff?.lastName || ''}`.trim(),
    subject: record.staff?._id || record.staff,
    meta: { date: record.date, status: record.status },
  });

  return sendSuccess(res, 200, 'Attendance record deleted', {});
};

module.exports = {
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
};
