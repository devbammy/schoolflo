const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Class = require('../models/Class');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { getCurrentPeriod } = require('../utils/academicPeriod');
const {
  getTeacherClasses,
  assertClassAccess,
} = require('../utils/teacherScope');

/**
 * A register is stored per calendar day, so every date that arrives has to be
 * flattened to midnight UTC before it touches the collection. Without this the
 * unique index on { student, date } sees 09:00 and 14:00 as different days and
 * happily stores two registers for one morning.
 */
const startOfDay = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw AppError.badRequest('Provide a valid date.');
  }
  date.setUTCHours(0, 0, 0, 0);
  return date;
};

const endOfDay = (value) => {
  const date = startOfDay(value);
  date.setUTCHours(23, 59, 59, 999);
  return date;
};

/**
 * Who may read a given student's attendance.
 * Mirrors the rule used for results: staff see everyone, students see
 * themselves, parents see their own children.
 */
const checkAttendanceAccess = (user, studentId) => {
  if (user.role === 'Admin' || user.role === 'Teacher') return null;

  if (user.role === 'Student') {
    return String(user._id) === String(studentId)
      ? null
      : 'You can only view your own attendance.';
  }

  if (user.role === 'Parent') {
    const childIds = user.parentProfile?.children?.map(String) || [];
    return childIds.includes(String(studentId))
      ? null
      : "You can only view your own children's attendance.";
  }

  return 'Access denied.';
};

// @desc    Mark attendance for a class (bulk upsert, one record per student/day)
// @route   POST /api/v1/attendance/mark
// @access  Admin, Teacher (own classes)
const markAttendance = async (req, res) => {
  const { classId, section, date, records } = req.body;

  await assertClassAccess(req.user, classId);

  const day = startOfDay(date);

  // A register cannot be marked for a day that has not happened.
  if (day > endOfDay(new Date())) {
    throw AppError.badRequest('Attendance cannot be marked for a future date.');
  }

  // The term and session a register belongs to are decided by the school
  // calendar, not by the page that submitted it. The client may still pass
  // them — for backfilling an earlier term — but it does not have to, and a
  // stale hard-coded default can no longer misfile a whole class's register.
  const period = await getCurrentPeriod(day);
  const term = req.body.term || period.term;
  const academicYear = req.body.academicYear || period.academicYear;

  // Only students actually in this class may appear on its register.
  const enrolled = await User.find({
    role: 'Student',
    'studentProfile.class': classId,
  }).select('_id');

  const enrolledIds = new Set(enrolled.map((s) => String(s._id)));

  const foreign = records.filter(
    (record) => !enrolledIds.has(String(record.student)),
  );

  if (foreign.length) {
    throw AppError.badRequest(
      `${foreign.length} student(s) on this register are not in the selected class.`,
    );
  }

  const ops = records.map(({ student, status, note }) => ({
    updateOne: {
      filter: { student, date: day },
      update: {
        $set: {
          student,
          class: classId,
          section,
          date: day,
          status,
          markedBy: req.user._id,
          term,
          academicYear,
          note,
          timeMarked: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await Attendance.bulkWrite(ops);

  const absent = records.filter((r) => r.status === 'Absent').length;

  await audit.record(req, {
    action: 'attendance.mark',
    entity: 'Attendance',
    meta: {
      class: String(classId),
      section,
      date: day,
      term,
      academicYear,
      periodSource: period.source,
      students: records.length,
      absent,
      created: result.upsertedCount,
      updated: result.modifiedCount,
    },
  });

  return sendSuccess(res, 200, 'Attendance marked', {
    processed: result.upsertedCount + result.modifiedCount,
    created: result.upsertedCount,
    updated: result.modifiedCount,
    term,
    academicYear,
  });
};

// @desc    The register for a class: its students, plus whatever was already
//          marked for the requested day
// @route   GET /api/v1/attendance/class/:classId?date=YYYY-MM-DD
// @access  Admin, Teacher (own classes)
const getClassRegister = async (req, res) => {
  const { classId } = req.params;

  await assertClassAccess(req.user, classId);

  const day = startOfDay(req.query.date || new Date());

  const [students, records, period] = await Promise.all([
    User.find({
      role: 'Student',
      'studentProfile.class': new mongoose.Types.ObjectId(classId),
    })
      .select('firstName lastName studentProfile avatar')
      .sort({ lastName: 1, firstName: 1 }),

    // The saved register, so reopening the page shows what was marked rather
    // than defaulting everyone back to Present and inviting an overwrite.
    Attendance.find({ class: classId, date: day })
      .select('student status note markedBy timeMarked')
      .populate('markedBy', 'firstName lastName'),

    getCurrentPeriod(day),
  ]);

  return sendSuccess(res, 200, 'Register fetched', {
    students,
    records,
    date: day,
    period,
    isMarked: records.length > 0,
  });
};

// @desc    Classes this teacher may mark a register for
// @route   GET /api/v1/attendance/my-classes
// @access  Teacher, Admin
const getMyClasses = async (req, res) => {
  const classes =
    req.user.role === 'Admin'
      ? await Class.find({ isActive: true })
          .select('name level academicYear sections')
          .sort({ name: 1 })
      : await getTeacherClasses(req.user);

  return sendSuccess(res, 200, 'Classes fetched', { classes });
};

// @desc    Per-student totals for a class over a date range
// @route   GET /api/v1/attendance/class/:classId/report?from=&to=
// @access  Admin, Teacher (own classes)
const getClassReport = async (req, res) => {
  const { classId } = req.params;

  await assertClassAccess(req.user, classId);

  const to = endOfDay(req.query.to || new Date());
  const from = startOfDay(
    req.query.from || new Date(to.getTime() - 29 * 24 * 60 * 60 * 1000),
  );

  if (from > to) {
    throw AppError.badRequest('The start date must fall before the end date.');
  }

  const rows = await Attendance.aggregate([
    {
      $match: {
        class: new mongoose.Types.ObjectId(classId),
        date: { $gte: from, $lte: to },
      },
    },
    {
      $group: {
        _id: { student: '$student', status: '$status' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.student',
        counts: { $push: { status: '$_id.status', count: '$count' } },
        total: { $sum: '$count' },
      },
    },
  ]);

  const students = await User.find({
    role: 'Student',
    'studentProfile.class': classId,
  })
    .select('firstName lastName studentProfile.admissionNumber')
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  const byStudent = new Map(rows.map((row) => [String(row._id), row]));

  // Every enrolled student appears, including one with no records at all —
  // a blank row is the answer to "who has never been marked?".
  const report = students.map((student) => {
    const row = byStudent.get(String(student._id));

    const tally = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
    (row?.counts || []).forEach(({ status, count }) => {
      tally[status] = count;
    });

    const total = row?.total || 0;

    return {
      student: {
        _id: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        admissionNumber: student.studentProfile?.admissionNumber || '',
      },
      ...tally,
      total,
      percentage:
        total > 0
          ? Number((((tally.Present + tally.Late) / total) * 100).toFixed(1))
          : 0,
    };
  });

  // How many distinct days the register was actually taken, so a low
  // percentage can be read against the days it was measured over.
  const daysMarked = await Attendance.distinct('date', {
    class: classId,
    date: { $gte: from, $lte: to },
  });

  return sendSuccess(res, 200, 'Attendance report', {
    report,
    from,
    to,
    daysMarked: daysMarked.length,
  });
};

// @desc    Attendance summary for one student
// @route   GET /api/v1/attendance/student/:studentId/summary
// @access  Admin, Teacher, Student (own), Parent (own child)
const getStudentSummary = async (req, res) => {
  const { studentId } = req.params;

  const denied = checkAttendanceAccess(req.user, studentId);
  if (denied) throw AppError.forbidden(denied);

  // Defaulting to the current period means a student's own dashboard does not
  // have to know which term the school is in to ask this question.
  const period = await getCurrentPeriod();
  const term = req.query.term || period.term;
  const academicYear = req.query.academicYear || period.academicYear;

  const summary = await Attendance.getSummary(studentId, term, academicYear);

  return sendSuccess(res, 200, 'Attendance summary', {
    summary,
    term,
    academicYear,
  });
};

module.exports = {
  markAttendance,
  getClassRegister,
  getClassReport,
  getMyClasses,
  getStudentSummary,
  checkAttendanceAccess,
};
