const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// Mark attendance for a class (bulk)
router.post(
  '/mark',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const { classId, section, date, records, term, academicYear } = req.body;
      // records: [{ student, status, note }]
      const ops = records.map(({ student, status, note }) => ({
        updateOne: {
          filter: { student, date: new Date(date) },
          update: {
            $set: {
              student,
              class: classId,
              section,
              date: new Date(date),
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
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// Get class attendance for a date
// router.get('/class/:classId', protect, authorize('Admin', 'Teacher'), async (req, res) => {
//   try {
//     const { date, term, academicYear } = req.query;
//     const filter = { class: req.params.classId };
//     if (date) {
//       const d = new Date(date);
//       d.setHours(0, 0, 0, 0);
//       const dEnd = new Date(date);
//       dEnd.setHours(23, 59, 59, 999);
//       filter.date = { $gte: d, $lte: dEnd };
//     }
//     if (term) filter.term = term;
//     if (academicYear) filter.academicYear = academicYear;

//     const records = await Attendance.find(filter)
//       .populate('student', 'firstName lastName studentProfile.admissionNumber avatar')
//       .sort({ 'student.lastName': 1 });
//     return sendSuccess(res, 200, 'Attendance fetched', { records });
//   } catch (err) { return sendError(res, 500, err.message); }
// });
router.get(
  '/class/:classId',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    const sample = await User.findOne({ role: 'Student' });
    console.log(
      'STUDENT CLASS:',
      sample.studentProfile.class,
      typeof sample.studentProfile.class,
    );
    try {
      const students = await User.find({
        role: 'Student',
        'studentProfile.class': new mongoose.Types.ObjectId(req.params.classId),
      }).select('firstName lastName studentProfile admissionNumber avatar');

      return sendSuccess(res, 200, 'Students fetched', { students });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// Get student attendance summary
router.get('/student/:studentId/summary', protect, async (req, res) => {
  try {
    const { term, academicYear } = req.query;
    const summary = await Attendance.getSummary(
      req.params.studentId,
      term,
      academicYear,
    );
    return sendSuccess(res, 200, 'Attendance summary', { summary });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

module.exports = router;
