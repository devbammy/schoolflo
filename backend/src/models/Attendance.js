const mongoose = require('mongoose');
const { ATTENDANCE_STATUS } = require('../config/constants');

const AttendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    section: String,
    date: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ATTENDANCE_STATUS),
      required: true,
      default: ATTENDANCE_STATUS.PRESENT,
    },
    markedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    term: {
      type: String,
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    note: String,
    timeMarked: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Prevent duplicate attendance entries per student per day
AttendanceSchema.index({ student: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ class: 1, date: 1 });
AttendanceSchema.index({ student: 1, term: 1, academicYear: 1 });

// Static: Get attendance summary for a student
AttendanceSchema.statics.getSummary = async function (
  studentId,
  term,
  academicYear,
) {
  const summary = await this.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(studentId),
        term,
        academicYear,
      },
    },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);

  const result = { Present: 0, Absent: 0, Late: 0, Excused: 0, total: 0 };
  summary.forEach((s) => {
    result[s._id] = s.count;
    result.total += s.count;
  });
  result.percentage =
    result.total > 0
      ? (((result.Present + result.Late) / result.total) * 100).toFixed(1)
      : 0;

  return result;
};

module.exports = mongoose.model('Attendance', AttendanceSchema);
