const mongoose = require('mongoose');
const { ATTENDANCE_STATUS, STAFF_ATTENDANCE } = require('../config/constants');
const { parseClockTime, endOfDayKey } = require('../utils/schoolTime');

/**
 * One staff member's presence on one day.
 *
 * A record exists because somebody clocked in, or because an admin recorded
 * an absence or a leave day. The absence of a record is therefore meaningful
 * in itself: it means nobody accounted for that person that day. The daily
 * roster reconstructs that gap rather than the system writing an Absent row
 * for every member of staff every night — a nightly job that silently stops
 * running is far worse than a gap that is computed on demand.
 *
 * `date` is a day *key*: UTC midnight standing for a school-local calendar
 * day (see utils/schoolTime). Clock times are stored as true instants.
 */

const SOURCES = ['clock', 'admin'];

const StaffAttendanceSchema = new mongoose.Schema(
  {
    staff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    date: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
      default: ATTENDANCE_STATUS.PRESENT,
      index: true,
    },

    clockIn: {
      at: Date,
      ip: String,
      note: { type: String, trim: true, maxlength: 500 },
      // Kept as a number so "how late, typically?" is answerable without
      // re-deriving it from a start time that may since have changed.
      minutesLate: { type: Number, default: 0 },
    },

    clockOut: {
      at: Date,
      ip: String,
      note: { type: String, trim: true, maxlength: 500 },
    },

    // Written once on clock-out. Denormalised so the summary aggregation does
    // not have to subtract dates across thousands of documents.
    workedMinutes: { type: Number, default: 0 },

    // Whether the staff member recorded this themselves or an admin did.
    source: { type: String, enum: SOURCES, default: 'clock' },

    // Set whenever an admin creates or corrects the record.
    markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminNote: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// One record per person per day — the rule the whole feature rests on. Two
// clock-ins racing each other fail here rather than creating a duplicate.
StaffAttendanceSchema.index({ staff: 1, date: 1 }, { unique: true });

// The admin's two reads: one day across everyone, one person across a range.
StaffAttendanceSchema.index({ date: -1, status: 1 });
StaffAttendanceSchema.index({ staff: 1, date: -1 });

/** Still clocked in — on the premises as far as the system knows. */
StaffAttendanceSchema.virtual('isOpen').get(function () {
  return Boolean(this.clockIn?.at && !this.clockOut?.at);
});

StaffAttendanceSchema.statics.SOURCES = SOURCES;

/**
 * The configured working day, resolved once so controllers and the client
 * agree on what "late" means.
 */
StaffAttendanceSchema.statics.workDay = function () {
  const start = parseClockTime(STAFF_ATTENDANCE.DAY_START) ?? 8 * 60;
  const end = parseClockTime(STAFF_ATTENDANCE.DAY_END) ?? 15 * 60 + 30;

  return {
    start,
    end,
    graceMinutes: STAFF_ATTENDANCE.LATE_GRACE_MINUTES,
    startLabel: STAFF_ATTENDANCE.DAY_START,
    endLabel: STAFF_ATTENDANCE.DAY_END,
  };
};

/**
 * Which status an arrival at `minutes` past local midnight earns.
 */
StaffAttendanceSchema.statics.statusForArrival = function (minutes) {
  const { start, graceMinutes } = this.workDay();

  return minutes > start + graceMinutes
    ? ATTENDANCE_STATUS.LATE
    : ATTENDANCE_STATUS.PRESENT;
};

/** A Mongo filter for a single day key. */
StaffAttendanceSchema.statics.onDay = (key) => ({
  date: { $gte: new Date(key), $lt: endOfDayKey(key) },
});

/**
 * Counts by status plus worked-time totals, over whatever slice is passed —
 * one teacher's term, or the whole school's week.
 */
StaffAttendanceSchema.statics.getSummary = async function (filter = {}) {
  const [rows, totals] = await Promise.all([
    this.aggregate([
      { $match: filter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    this.aggregate([
      { $match: { ...filter, workedMinutes: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          workedMinutes: { $sum: '$workedMinutes' },
          days: { $sum: 1 },
          lateMinutes: { $sum: '$clockIn.minutesLate' },
        },
      },
    ]),
  ]);

  const summary = Object.values(ATTENDANCE_STATUS).reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  let total = 0;
  rows.forEach((row) => {
    summary[row._id] = row.count;
    total += row.count;
  });

  const worked = totals[0] || { workedMinutes: 0, days: 0, lateMinutes: 0 };

  // "Turned up" counts Late — being late is not being absent, and a rate that
  // punishes both identically tells an admin nothing about either.
  const attended =
    summary[ATTENDANCE_STATUS.PRESENT] + summary[ATTENDANCE_STATUS.LATE];

  return {
    ...summary,
    total,
    attended,
    workedMinutes: worked.workedMinutes,
    // Averaged over completed days only: a day still open would drag it down.
    averageWorkedMinutes: worked.days
      ? Math.round(worked.workedMinutes / worked.days)
      : 0,
    completedDays: worked.days,
    totalLateMinutes: worked.lateMinutes || 0,
    attendanceRate: total ? Number(((attended / total) * 100).toFixed(1)) : 0,
  };
};

module.exports = mongoose.model('StaffAttendance', StaffAttendanceSchema);
