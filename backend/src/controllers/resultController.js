const { Result, Exam, calculateGrade } = require('../models/Exam');
const User = require('../models/User');
const {
  sendSuccess,
  sendError,
  getPaginationParams,
  sendPaginated,
} = require('../utils/apiResponse');
const {
  computeClassStatistics,
  generateReportCard,
} = require('../services/gradingService');
const {
  sendEmail,
  sendBulkEmails,
  emailTemplates,
} = require('../services/notificationService');

// ✅ Helper (centralized calculation)
const computeResultFields = (scores = {}) => {
  const { ca1 = 0, ca2 = 0, midTerm = 0, exam = 0 } = scores;

  const totalScore = ca1 + ca2 + midTerm + exam;
  const grading = calculateGrade(totalScore);

  return {
    scores: { ca1, ca2, midTerm, exam },
    totalScore,
    grade: grading.grade,
    remark: grading.remark,
    gradePoint: grading.gradePoint,
  };
};

// @desc    Enter/update scores for a student subject
// @route   POST /api/v1/results
// @access  Teacher, Admin
const upsertResult = async (req, res) => {
  try {
    const {
      student,
      class: classId,
      subject,
      exam,
      term,
      academicYear,
      scores,
      teacherComment,
    } = req.body;

    const studentUser = await User.findById(student);
    if (!studentUser || studentUser.role !== 'Student') {
      return sendError(res, 404, 'Student not found');
    }

    // ✅ Validate score caps
    const { ca1 = 0, ca2 = 0, midTerm = 0, exam: examScore = 0 } = scores || {};
    if (ca1 > 10 || ca2 > 10 || midTerm > 10 || examScore > 70) {
      return sendError(res, 400, 'Score exceeds maximum');
    }

    // ✅ COMPUTE HERE (critical fix)
    const computed = computeResultFields({
      ca1,
      ca2,
      midTerm,
      exam: examScore,
    });

    const result = await Result.findOneAndUpdate(
      { student, subject, term, academicYear },
      {
        student,
        class: classId,
        subject,
        exam,
        term,
        academicYear,
        ...computed, // ✅ inject calculated fields
        teacherComment,
        gradedBy: req.user._id,
      },
      { new: true, upsert: true, runValidators: true },
    )
      .populate('subject', 'name code')
      .populate('student', 'firstName lastName');

    return sendSuccess(res, 200, 'Result saved successfully', { result });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Bulk upload results for an entire class/subject
// @route   POST /api/v1/results/bulk
// @access  Teacher, Admin
const bulkUpsertResults = async (req, res) => {
  try {
    const { class: classId, subject, term, academicYear, results } = req.body;

    if (!Array.isArray(results) || !results.length) {
      return sendError(res, 400, 'Results array is required');
    }

    const operations = results.map(
      ({ student, scores = {}, teacherComment }) => {
        const { ca1 = 0, ca2 = 0, midTerm = 0, exam = 0 } = scores;

        // ✅ COMPUTE HERE (critical fix)
        const computed = computeResultFields({ ca1, ca2, midTerm, exam });

        return {
          updateOne: {
            filter: { student, subject, term, academicYear },
            update: {
              $set: {
                student,
                class: classId,
                subject,
                term,
                academicYear,
                ...computed, // ✅ inject calculated fields
                teacherComment,
                gradedBy: req.user._id,
              },
            },
            upsert: true,
          },
        };
      },
    );

    const bulkResult = await Result.bulkWrite(operations);

    return sendSuccess(
      res,
      200,
      `${bulkResult.upsertedCount + bulkResult.modifiedCount} results saved`,
      {
        inserted: bulkResult.upsertedCount,
        updated: bulkResult.modifiedCount,
      },
    );
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Compute positions and class stats, then publish
// @route   POST /api/v1/results/publish
// @access  Admin
const publishResults = async (req, res) => {
  const showResults = await Result.findOne().select('scores totalScore grade');

  console.log(showResults);

  try {
    const { class: classId, term, academicYear } = req.body;

    // Step 1: Compute stats & positions
    const statsResult = await computeClassStatistics(
      classId,
      term,
      academicYear,
    );
    if (!statsResult.success) return sendError(res, 400, statsResult.message);

    // Step 2: Publish all results
    const updated = await Result.updateMany(
      { class: classId, term, academicYear, isPublished: false },
      { $set: { isPublished: true } },
    );

    // Step 3: Notify parents via email
    const publishedResults = await Result.find({
      class: classId,
      term,
      academicYear,
      isPublished: true,
    })
      .populate('student', 'firstName lastName studentProfile.parentId')
      .distinct('student');

    // Fire notifications async (don't block response)
    notifyParentsOfResults(publishedResults, term, academicYear).catch(
      console.error,
    );

    return sendSuccess(
      res,
      200,
      `Results published. ${updated.modifiedCount} records updated.`,
      {
        processed: statsResult.processed,
        published: updated.modifiedCount,
      },
    );
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// Background: email parents
const notifyParentsOfResults = async (studentIds, term, academicYear) => {
  for (const studentId of studentIds) {
    const reportCard = await generateReportCard(studentId, term, academicYear);
    if (!reportCard) continue;

    const student = await User.findById(studentId).populate(
      'studentProfile.parentId',
      'email firstName',
    );
    const parent = student?.studentProfile?.parentId;
    if (!parent?.email) continue;

    await sendEmail({
      to: parent.email,
      subject: `${term} ${academicYear} Results Available — ${student.firstName} ${student.lastName}`,
      html: emailTemplates.resultPublished({
        studentName: `${student.firstName} ${student.lastName}`,
        term,
        academicYear,
        average: reportCard.summary.average,
        position: `${reportCard.summary.overallPosition} of ${reportCard.summary.totalStudentsInClass}`,
        loginUrl: `${process.env.CLIENT_URL}/login`,
      }),
    });
  }
};

// @desc    Get report card for a student
// @route   GET /api/v1/results/report-card/:studentId
// @access  Admin, Teacher, Student (own), Parent (own child)
const getReportCard = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { term, academicYear } = req.query;

    if (!term || !academicYear)
      return sendError(res, 400, 'Term and academicYear are required');

    // Parents can only view their children
    if (req.user.role === 'Parent') {
      const childIds = req.user.parentProfile?.children?.map(String) || [];
      if (!childIds.includes(studentId)) {
        return sendError(
          res,
          403,
          "You can only view your own children's results",
        );
      }
    }

    // Students can only view their own
    if (req.user.role === 'Student' && String(req.user._id) !== studentId) {
      return sendError(res, 403, 'Access denied');
    }

    const reportCard = await generateReportCard(studentId, term, academicYear);
    if (!reportCard)
      return sendError(res, 404, 'No published results found for this term');

    const student = await User.findById(studentId)
      .select('firstName lastName studentProfile avatar')
      .populate('studentProfile.class', 'name level');

    return sendSuccess(res, 200, 'Report card fetched', {
      student,
      ...reportCard,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Get all results for a class/term (for teacher view)
// @route   GET /api/v1/results/class/:classId
// @access  Teacher, Admin
const getClassResults = async (req, res) => {
  try {
    const { classId } = req.params;
    const { term, academicYear, subject } = req.query;

    const filter = { class: classId };
    if (term) filter.term = term;
    if (academicYear) filter.academicYear = academicYear;
    if (subject) filter.subject = subject;

    const results = await Result.find(filter)
      .populate(
        'student',
        'firstName lastName studentProfile.admissionNumber avatar',
      )
      .populate('subject', 'name code')
      .sort({ 'student.lastName': 1 });

    return sendSuccess(res, 200, 'Class results fetched', {
      results,
      count: results.length,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Get student's result history across terms
// @route   GET /api/v1/results/student/:studentId/history
// @access  Admin, Teacher, Student (own), Parent (child)
const getStudentResultHistory = async (req, res) => {
  try {
    const { studentId } = req.params;

    const results = await Result.find({ student: studentId, isPublished: true })
      .populate('subject', 'name code')
      .populate('class', 'name')
      .sort({ academicYear: -1, term: 1 });

    // Group by academicYear + term
    const grouped = {};
    results.forEach((r) => {
      const key = `${r.academicYear} — ${r.term}`;
      if (!grouped[key])
        grouped[key] = {
          term: r.term,
          academicYear: r.academicYear,
          subjects: [],
        };
      grouped[key].subjects.push(r);
    });

    return sendSuccess(res, 200, 'Result history fetched', {
      history: Object.values(grouped),
      total: results.length,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

module.exports = {
  upsertResult,
  bulkUpsertResults,
  publishResults,
  getReportCard,
  getClassResults,
  getStudentResultHistory,
};
