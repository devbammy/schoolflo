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
const caTrackingService = require('../services/caTrackingService');
const {
  validateScores,
  validateScoreBatch,
} = require('../utils/scoreValidation');

// Centralized calculation. Callers must pass scores that have already been
// through validateScores() — this only computes, it does not check.
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

/**
 * Who may read a given student's academic records.
 * Returns an error message, or null when the request is permitted.
 */
const checkResultAccess = (user, studentId) => {
  if (user.role === 'Admin' || user.role === 'Teacher') return null;

  if (user.role === 'Student') {
    return String(user._id) === String(studentId)
      ? null
      : 'You can only view your own results.';
  }

  if (user.role === 'Parent') {
    const childIds = user.parentProfile?.children?.map(String) || [];
    return childIds.includes(String(studentId))
      ? null
      : "You can only view your own children's results.";
  }

  return 'Access denied.';
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

    const validation = validateScores(scores);
    if (!validation.valid) {
      return sendError(res, 400, validation.errors.join(' '), validation.errors);
    }

    const computed = computeResultFields(validation.scores);

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

    // bulkWrite does not run Mongoose validators, so the schema's min/max on
    // the score fields never fires on this path. Validate every row up front
    // and reject the whole batch — a half applied set of scores is worse than
    // none, since the teacher cannot tell which rows landed.
    const batch = validateScoreBatch(
      results,
      (row, index) => `Student ${row?.student || index + 1}`,
    );

    if (!batch.valid) {
      return sendError(
        res,
        400,
        `${batch.errors.length} invalid score${batch.errors.length === 1 ? '' : 's'} — no results were saved.`,
        batch.errors,
      );
    }

    const operations = batch.rows.map(
      ({ student, scores = {}, teacherComment }) => {
        const computed = computeResultFields(scores);

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

    // Step 3: Sync CA Tracker for all students (auto-sync on publish)
    const publishedResults = await Result.find({
      class: classId,
      term,
      academicYear,
      isPublished: true,
    }).distinct('student');

    // Sync CA tracker for each student asynchronously
    publishedResults.forEach((studentId) => {
      caTrackingService
        .syncFromResults(studentId, academicYear)
        .catch(console.error);
    });

    // Step 4: Get student IDs for notifications
    const studentsForNotification = await Result.find({
      class: classId,
      term,
      academicYear,
      isPublished: true,
    })
      .populate('student', 'firstName lastName studentProfile.parentId')
      .distinct('student');

    // Fire notifications async (don't block response)
    notifyParentsOfResults(studentsForNotification, term, academicYear).catch(
      console.error,
    );

    return sendSuccess(
      res,
      200,
      `Results published. ${updated.modifiedCount} records updated. CA Tracker syncing in background.`,
      {
        processed: statsResult.processed,
        published: updated.modifiedCount,
      },
    );
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// Background: email parents that a term's results are available.
// Runs after the response has been sent, so a slow or failing SMTP server can
// never hold up (or roll back) a publish that already succeeded.
const notifyParentsOfResults = async (studentIds, term, academicYear) => {
  let sent = 0;
  let skipped = 0;

  for (const studentId of studentIds) {
    try {
      const reportCard = await generateReportCard(
        studentId,
        term,
        academicYear,
      );
      if (!reportCard) {
        skipped += 1;
        continue;
      }

      const student = await User.findById(studentId)
        .select('firstName lastName studentProfile.parentId')
        .populate('studentProfile.parentId', 'email firstName');

      const parent = student?.studentProfile?.parentId;
      if (!parent?.email) {
        skipped += 1;
        continue;
      }

      const { average, overallPosition, totalStudentsInClass } =
        reportCard.summary;

      const { success } = await sendEmail({
        to: parent.email,
        subject: `${term} results for ${student.firstName} ${student.lastName}`,
        html: emailTemplates.resultPublished({
          studentName: `${student.firstName} ${student.lastName}`,
          term,
          academicYear,
          average,
          position: `${overallPosition} of ${totalStudentsInClass}`,
          loginUrl: `${process.env.CLIENT_URL}/login`,
        }),
      });

      if (success) sent += 1;
      else skipped += 1;
    } catch (error) {
      skipped += 1;
      console.error(
        `Result notification failed for student ${studentId}: ${error.message}`,
      );
    }
  }

  console.log(
    `Result notifications for ${term} ${academicYear}: ${sent} sent, ${skipped} skipped`,
  );
  return { sent, skipped };
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

    const denied = checkResultAccess(req.user, studentId);
    if (denied) return sendError(res, 403, denied);

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

    const denied = checkResultAccess(req.user, studentId);
    if (denied) return sendError(res, 403, denied);

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
