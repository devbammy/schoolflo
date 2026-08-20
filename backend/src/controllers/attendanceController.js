const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');

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
// @access  Admin, Teacher
const markAttendance = async (req, res) => {
  const { classId, section, date, records, term, academicYear } = req.body;

  const day = new Date(date);

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

  return sendSuccess(res, 200, 'Attendance marked', {
    processed: result.upsertedCount + result.modifiedCount,
  });
};

// @desc    Students in a class, for building the attendance register
// @route   GET /api/v1/attendance/class/:classId
// @access  Admin, Teacher
const getClassRegister = async (req, res) => {
  const students = await User.find({
    role: 'Student',
    'studentProfile.class': new mongoose.Types.ObjectId(req.params.classId),
  }).select('firstName lastName studentProfile admissionNumber avatar');

  return sendSuccess(res, 200, 'Students fetched', { students });
};

// @desc    Attendance summary for one student
// @route   GET /api/v1/attendance/student/:studentId/summary
// @access  Admin, Teacher, Student (own), Parent (own child)
const getStudentSummary = async (req, res) => {
  const { studentId } = req.params;
  const { term, academicYear } = req.query;

  const denied = checkAttendanceAccess(req.user, studentId);
  if (denied) throw AppError.forbidden(denied);

  const summary = await Attendance.getSummary(studentId, term, academicYear);

  return sendSuccess(res, 200, 'Attendance summary', { summary });
};

module.exports = {
  markAttendance,
  getClassRegister,
  getStudentSummary,
  checkAttendanceAccess,
};
