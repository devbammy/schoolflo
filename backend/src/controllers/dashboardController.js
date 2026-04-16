const mongoose = require('mongoose');
const User = require('../models/User');
const { Result } = require('../models/Exam');
const Attendance = require('../models/Attendance');
const { Payment } = require('../models/Fees');
const { Assignment, Submission } = require('../models/Assignment');
const Announcement = require('../models/Announcement');
const { sendSuccess, sendError } = require('../utils/apiResponse');

// @desc    Admin master dashboard
// @route   GET /api/v1/dashboard/admin
// @access  Admin
const getAdminDashboard = async (req, res) => {
  try {
    const { academicYear, term } = req.query;
    const now = new Date();

    const [
      totalStudents,
      totalTeachers,
      totalParents,
      activeStudents,
      paymentStats,
      recentPayments,
      announcements,
      attendanceToday,
      assignmentStats,
    ] = await Promise.all([
      User.countDocuments({ role: 'Student' }),
      User.countDocuments({ role: 'Teacher' }),
      User.countDocuments({ role: 'Parent' }),
      User.countDocuments({
        role: 'Student',
        'studentProfile.profileStatus': 'Active',
      }),

      Payment.aggregate([
        ...(term ? [{ $match: { term, academicYear } }] : []),
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            total: { $sum: '$amountPaid' },
          },
        },
      ]),

      Payment.find({})
        .populate('student', 'firstName lastName avatar')
        .populate('feeStructure', 'title')
        .sort({ createdAt: -1 })
        .limit(5),

      Announcement.find({ isPublished: true })
        .populate('author', 'firstName lastName role')
        .sort({ publishedAt: -1 })
        .limit(5),

      Attendance.aggregate([
        {
          $match: {
            date: {
              $gte: new Date(now.setHours(0, 0, 0, 0)),
              $lt: new Date(now.setHours(23, 59, 59, 999)),
            },
          },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),

      Assignment.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: ['$isActive', 1, 0] } },
          },
        },
      ]),
    ]);

    // Enrollment trend (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    const enrollmentTrend = await User.aggregate([
      { $match: { role: 'Student', createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]);

    const paymentSummary = {
      Paid: 0,
      Pending: 0,
      Partial: 0,
      Overdue: 0,
      totalRevenue: 0,
    };
    paymentStats.forEach((p) => {
      paymentSummary[p._id] = p.count;
      if (p._id === 'Paid') paymentSummary.totalRevenue = p.total;
    });

    const attendanceSummary = { Present: 0, Absent: 0, Late: 0 };
    attendanceToday.forEach((a) => {
      attendanceSummary[a._id] = a.count;
    });

    return sendSuccess(res, 200, 'Admin dashboard data', {
      stats: {
        totalStudents,
        totalTeachers,
        totalParents,
        activeStudents,
        attendance: attendanceSummary,
        payments: paymentSummary,
        assignments: assignmentStats[0] || { total: 0, active: 0 },
      },
      recentPayments,
      announcements,
      enrollmentTrend,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Teacher dashboard
// @route   GET /api/v1/dashboard/teacher
// @access  Teacher
// const getTeacherDashboard = async (req, res) => {
//   try {
//     const teacherId = req.user._id;
//     const { term, academicYear } = req.query;

//     const teacher = await User.findById(teacherId)
//       .populate('teacherProfile.classTeacherOf', 'name sections')
//       .populate('teacherProfile.subjectsTaught', 'name code');

//     const myClass = teacher.teacherProfile?.classTeacherOf;
//     const mySubjects = teacher.teacherProfile?.subjectsTaught || [];

//     const [assignments, pendingGrades, announcements] = await Promise.all([
//       Assignment.find({ teacher: teacherId, isActive: true })
//         .populate('class', 'name')
//         .populate('subject', 'name')
//         .sort({ dueDate: 1 })
//         .limit(10),

//       Submission.countDocuments({
//         status: 'Submitted',
//         assignment: {
//           $in: await Assignment.find({ teacher: teacherId }).distinct('_id'),
//         },
//       }),

//       Announcement.find({
//         isPublished: true,
//         targetAudience: { $in: ['All', 'Teacher'] },
//       })
//         .sort({ publishedAt: -1 })
//         .limit(5),
//     ]);

//     // Today's attendance for my class
//    let todayAttendance = null;

//    if (myClass) {
//      const today = new Date();
//      today.setHours(0, 0, 0, 0);

//      const counts = await Attendance.aggregate([
//        {
//          $match: {
//            class: myClass._id,
//            date: { $gte: today },
//          },
//        },
//        { $unwind: '$records' },
//        {
//          $group: {
//            _id: '$records.status',
//            count: { $sum: 1 },
//          },
//        },
//      ]);

//      todayAttendance = { Present: 0, Absent: 0, Late: 0 };

//      counts.forEach((c) => {
//        todayAttendance[c._id] = c.count;
//      });
//    }

//     return sendSuccess(res, 200, 'Teacher dashboard data', {
//       teacher: {
//         fullName: teacher.fullName,
//         classTeacher: myClass,
//         subjects: mySubjects,
//       },
//       stats: {
//         assignmentsCreated: assignments.length,
//         pendingGrades,
//       },
//       assignments,
//       todayAttendance,
//       announcements,
//     });
//   } catch (error) {
//     return sendError(res, 500, error.message);
//   }
// };

const getTeacherDashboard = async (req, res) => {
  try {
    const teacherId = req.user._id;
    const { term, academicYear } = req.query;

    // 🔹 Fetch teacher with relations
    const teacher = await User.findById(teacherId)
      .populate('teacherProfile.classTeacherOf', 'name sections')
      .populate('teacherProfile.subjectsTaught', 'name code');

    if (!teacher) {
      return sendError(res, 404, 'Teacher not found');
    }

    const myClass = teacher.teacherProfile?.classTeacherOf;
    const mySubjects = teacher.teacherProfile?.subjectsTaught || [];

    // 🔹 Get assignment IDs once (avoids nested await in query)
    const assignmentIds = await Assignment.find({
      teacher: teacherId,
    }).distinct('_id');

    // 🔹 Parallel queries
    const [assignments, pendingGrades, announcements] = await Promise.all([
      Assignment.find({ teacher: teacherId, isActive: true })
        .populate('class', 'name')
        .populate('subject', 'name')
        .sort({ dueDate: 1 })
        .limit(10),

      Submission.countDocuments({
        status: 'Submitted',
        assignment: { $in: assignmentIds },
      }),

      Announcement.find({
        isPublished: true,
        targetAudience: { $in: ['All', 'Teacher'] },
      })
        .sort({ publishedAt: -1 })
        .limit(5),
    ]);

    // 🔹 Today's attendance (STRICT date range)
    let todayAttendance = null;

    if (myClass?._id) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);

      const end = new Date();
      end.setHours(23, 59, 59, 999);

      const counts = await Attendance.aggregate([
        {
          $match: {
            class: new mongoose.Types.ObjectId(myClass._id),
            date: { $gte: start, $lte: end },
          },
        },
        { $unwind: '$records' },
        {
          $group: {
            _id: '$records.status',
            count: { $sum: 1 },
          },
        },
      ]);

      todayAttendance = { Present: 0, Absent: 0, Late: 0 };

      counts.forEach((c) => {
        todayAttendance[c._id] = c.count;
      });
    }

    // 🔹 Response
    return sendSuccess(res, 200, 'Teacher dashboard data', {
      teacher: {
        fullName: teacher.fullName,
        classTeacher: myClass,
        subjects: mySubjects,
      },
      stats: {
        assignmentsCreated: assignments.length,
        pendingGrades,
      },
      assignments,
      todayAttendance,
      announcements,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

const getStudentDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;
    const { term, academicYear } = req.query;

    const student = await User.findById(studentId)
      .populate('studentProfile.class', 'name level subjects')
      .select('firstName lastName studentProfile avatar');

    const classId = student.studentProfile?.class?._id;

    const [
      results,
      attendanceDocs,
      pendingAssignments,
      announcements,
      recentPayment,
    ] = await Promise.all([
      Result.find({
        student: studentId,
        term,
        academicYear,
        isPublished: true,
      })
        .populate('subject', 'name code')
        .sort({ totalScore: -1 }),

      classId
        ? Attendance.find({
            'records.student': studentId,
            term,
            academicYear,
          })
        : [],

      classId
        ? Assignment.find({
            class: classId,
            dueDate: { $gte: new Date() },
            isActive: true,
          })
            .populate('subject', 'name')
            .sort({ dueDate: 1 })
            .limit(5)
        : [],

      Announcement.find({
        isPublished: true,
        targetAudience: { $in: ['All', 'Student'] },
      })
        .sort({ publishedAt: -1 })
        .limit(5),

      Payment.findOne({ student: studentId })
        .sort({ createdAt: -1 })
        .populate('feeStructure', 'title term totalAmount'),
    ]);

    // ✅ Compute attendance summary from records[]
    let attendanceSummary = {
      Present: 0,
      Absent: 0,
      Late: 0,
      Excused: 0,
      percentage: 0,
    };

    if (attendanceDocs.length) {
      attendanceDocs.forEach((doc) => {
        const record = doc.records.find(
          (r) => r.student.toString() === studentId.toString(),
        );

        if (!record) return;

        if (attendanceSummary[record.status] !== undefined) {
          attendanceSummary[record.status]++;
        }
      });

      const total =
        attendanceSummary.Present +
        attendanceSummary.Absent +
        attendanceSummary.Late +
        attendanceSummary.Excused;

      attendanceSummary.percentage = total
        ? Number(((attendanceSummary.Present / total) * 100).toFixed(1))
        : 0;
    }

    const allAttendance = await Attendance.find({});
    console.log(JSON.stringify(allAttendance, null, 2));

    // ✅ Average score
    const avgScore = results.length
      ? Number(
          (
            results.reduce((s, r) => s + r.totalScore, 0) / results.length
          ).toFixed(1),
        )
      : null;

    return sendSuccess(res, 200, 'Student dashboard data', {
      student,
      stats: {
        averageScore: avgScore,
        subjectCount: results.length,
        attendance: attendanceSummary, // ✅ now correct shape
        pendingAssignmentsCount: pendingAssignments.length,
      },
      recentResults: results.slice(0, 5),
      pendingAssignments,
      announcements,
      recentPayment,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Parent dashboard
// @route   GET /api/v1/dashboard/parent
// @access  Parent
const getParentDashboard = async (req, res) => {
  try {
    const parentId = req.user._id;
    const parent = await User.findById(parentId).populate({
      path: 'parentProfile.children',
      select: 'firstName lastName avatar studentProfile',
      populate: { path: 'studentProfile.class', select: 'name level' },
    });

    const children = parent.parentProfile?.children || [];

    // For each child, get latest results + payment status
    const childrenData = await Promise.all(
      children.map(async (child) => {
        const [latestResults, latestPayment, attendanceSummary] =
          await Promise.all([
            Result.find({ student: child._id, isPublished: true })
              .populate('subject', 'name')
              .sort({ createdAt: -1 })
              .limit(5),

            Payment.findOne({ student: child._id })
              .sort({ createdAt: -1 })
              .populate('feeStructure', 'title totalAmount term'),

            Attendance.getSummary(
              child._id,
              req.query.term,
              req.query.academicYear,
            ),
          ]);

        const avg = latestResults.length
          ? (
              latestResults.reduce((s, r) => s + r.totalScore, 0) /
              latestResults.length
            ).toFixed(1)
          : null;

        return {
          child,
          averageScore: avg,
          latestResults,
          latestPayment,
          attendance: attendanceSummary,
        };
      }),
    );

    const announcements = await Announcement.find({
      isPublished: true,
      targetAudience: { $in: ['All', 'Parent'] },
    })
      .sort({ publishedAt: -1 })
      .limit(5);

    return sendSuccess(res, 200, 'Parent dashboard data', {
      childrenData,
      announcements,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

module.exports = {
  getAdminDashboard,
  getTeacherDashboard,
  getStudentDashboard,
  getParentDashboard,
};
