const mongoose = require('mongoose');
const User = require('../models/User');
const { Result } = require('../models/Exam');
const Attendance = require('../models/Attendance');
const { Fees, Payment } = require('../models/Fees');
const { Assignment, Submission } = require('../models/Assignment');
const Announcement = require('../models/Announcement');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { getFeeBalances } = require('../services/paymentService');
const { buildAdminOverview } = require('../services/adminOverviewService');
const { getCurrentPeriod } = require('../utils/academicPeriod');

// @desc    Admin master dashboard
// @route   GET /api/v1/dashboard/admin
// @access  Admin
const getAdminDashboard = async (req, res) => {
  const { academicYear, term } = req.query;

  const [
    overview,
    totalStudents,
    totalTeachers,
    totalParents,
    activeStudents,
    paymentStats,
    recentPayments,
    announcements,
    assignmentStats,
  ] = await Promise.all([
    // The three questions the overview actually answers: what is happening,
    // what needs attention, what to do next. The counts below are context for
    // those answers, not the point of the screen.
    buildAdminOverview({ academicYear, term }),

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

  // How this term's money arrived, for the admin's collection-modes chart.
  const feeModeRows = await Payment.aggregate([
    {
      $match: {
        term: overview.context.term,
        academicYear: overview.context.academicYear,
        amountPaid: { $gt: 0 },
      },
    },
    { $group: { _id: '$gateway', amount: { $sum: '$amountPaid' } } },
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

  return sendSuccess(res, 200, 'Admin dashboard data', {
    ...overview,
    stats: {
      totalStudents,
      totalTeachers,
      totalParents,
      activeStudents,
      // Today's roll call now comes from the overview, which knows the
      // difference between "nobody was absent" and "nobody marked the register".
      attendance: overview.pulse.attendance,
      payments: paymentSummary,
      assignments: assignmentStats[0] || { total: 0, active: 0 },
    },
    recentPayments,
    announcements,
    enrollmentTrend,
    feeModes: feeModeRows.map((row) => ({
      gateway: row._id,
      amount: row.amount,
    })),
    generatedAt: new Date(),
  });
};

// @desc    Teacher dashboard
// @route   GET /api/v1/dashboard/teacher
// @access  Teacher
const getTeacherDashboard = async (req, res) => {
  const teacherId = req.user._id;

  const teacher = await User.findById(teacherId)
    .populate('teacherProfile.classTeacherOf', 'name level sections')
    .populate('teacherProfile.subjectsTaught', 'name code');

  const myClass = teacher.teacherProfile?.classTeacherOf || null;
  const mySubjects = teacher.teacherProfile?.subjectsTaught || [];

  // Get all assignment IDs for this teacher first (needed for pendingGrades)
  const teacherAssignmentIds = await Assignment.find({
    teacher: teacherId,
  }).distinct('_id');

  // Run remaining queries in parallel — no nested awaits
  const [upcomingAssignments, totalAssignments, pendingGrades, announcements] =
    await Promise.all([
      // Upcoming / recent assignments for the dashboard list (capped at 10)
      Assignment.find({ teacher: teacherId, isActive: true })
        .populate('class', 'name')
        .populate('subject', 'name code')
        .sort({ dueDate: 1 })
        .limit(10),

      // Accurate total count — not limited
      Assignment.countDocuments({ teacher: teacherId, isActive: true }),

      // Submissions awaiting grading
      Submission.countDocuments({
        status: 'Submitted',
        assignment: { $in: teacherAssignmentIds },
      }),

      Announcement.find({
        isPublished: true,
        targetAudience: { $in: ['All', 'Teacher'] },
      })
        .sort({ publishedAt: -1 })
        .limit(5),
    ]);

  // Today's attendance — only run if the teacher has a class assigned
  let todayAttendance = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
  if (myClass) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const counts = await Attendance.aggregate([
      {
        $match: {
          class: myClass._id,
          date: { $gte: todayStart, $lte: todayEnd },
        },
      },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);

    counts.forEach((c) => {
      if (c._id) todayAttendance[c._id] = c.count;
    });
  }

  // Total students in the class (for attendance percentage)
  let totalStudentsInClass = 0;
  if (myClass) {
    totalStudentsInClass = await User.countDocuments({
      role: 'Student',
      'studentProfile.class': myClass._id,
      'studentProfile.profileStatus': { $in: ['Active', null, undefined] },
    });
  }

  return sendSuccess(res, 200, 'Teacher dashboard data', {
    teacher: {
      fullName: teacher.fullName,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      classTeacher: myClass,
      subjects: mySubjects,
    },
    stats: {
      totalAssignments, // accurate total, not capped
      upcomingAssignments: upcomingAssignments.length,
      pendingGrades,
      totalStudentsInClass,
    },
    assignments: upcomingAssignments,
    todayAttendance,
    announcements,
  });
};

const getStudentDashboard = async (req, res) => {
  const studentId = req.user._id;

  // The school calendar decides the term unless the caller names one. The
  // client used to send a hard-coded 'First Term', so in Second and Third Term
  // a student's dashboard kept showing First Term results and attendance.
  const period = await getCurrentPeriod();
  const term = req.query.term || period.term;
  const academicYear = req.query.academicYear || period.academicYear;

  const student = await User.findById(studentId)
    .populate('studentProfile.class', 'name level subjects')
    .select('firstName lastName studentProfile avatar');

  const classId = student.studentProfile?.class?._id;

  const [
    results,
    attendance,
    pendingAssignments,
    announcements,
    recentPayment,
  ] = await Promise.all([
    Result.find({ student: studentId, term, academicYear, isPublished: true })
      .populate('subject', 'name code')
      .sort({ totalScore: -1 }),

    classId ? Attendance.getSummary(studentId, term, academicYear) : null,

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
      .populate('feeStructure', 'title term totalAmount dueDate'),
  ]);

  // The latest payment record describes one instalment, and a settled
  // instalment looks fully paid however much of the fee is left. The standing
  // of the fee itself — everything received across both channels — is what
  // belongs on a dashboard.
  const [feeBalance] = recentPayment?.feeStructure
    ? await getFeeBalances(studentId, [recentPayment.feeStructure])
    : [];

  const avgScore = results.length
    ? (results.reduce((s, r) => s + r.totalScore, 0) / results.length).toFixed(
        1,
      )
    : null;

  return sendSuccess(res, 200, 'Student dashboard data', {
    student,
    stats: {
      averageScore: avgScore,
      subjectCount: results.length,
      attendance,
      pendingAssignmentsCount: pendingAssignments.length,
    },
    recentResults: results.slice(0, 5),
    pendingAssignments,
    announcements,
    recentPayment,
    feeBalance: feeBalance || null,
  });
};

// @desc    Parent dashboard
// @route   GET /api/v1/dashboard/parent
// @access  Parent
const getParentDashboard = async (req, res) => {
  const parentId = req.user._id;
  const parent = await User.findById(parentId).populate({
    path: 'parentProfile.children',
    select: 'firstName lastName avatar studentProfile',
    populate: { path: 'studentProfile.class', select: 'name level' },
  });

  const children = parent.parentProfile?.children || [];

  // Same rule as the student dashboard: the calendar decides unless told.
  const period = await getCurrentPeriod();
  const term = req.query.term || period.term;
  const academicYear = req.query.academicYear || period.academicYear;

  // For each child, get latest results + payment status
  const childrenData = await Promise.all(
    children.map(async (child) => {
      const [latestResults, latestPayment, attendanceSummary, currentFee] =
        await Promise.all([
          Result.find({ student: child._id, isPublished: true })
            .populate('subject', 'name')
            .sort({ createdAt: -1 })
            .limit(5),

          Payment.findOne({ student: child._id })
            .sort({ createdAt: -1 })
            .populate('feeStructure', 'title totalAmount term'),

          Attendance.getSummary(child._id, term, academicYear),

          Fees.findOne({
            class: child.studentProfile?.class?._id,
            term,
            academicYear,
            isActive: true,
          }),
        ]);

      // What the fee owes, from everything received against it. No single
      // Payment answers that: a part-payment is itself Paid while the fee is not.
      const [feeBalance] = currentFee
        ? await getFeeBalances(child._id, [currentFee])
        : [];

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
        feeBalance: feeBalance || null,
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
};

module.exports = {
  getAdminDashboard,
  getTeacherDashboard,
  getStudentDashboard,
  getParentDashboard,
};
