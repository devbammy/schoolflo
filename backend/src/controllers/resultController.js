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
const { emailTemplates } = require('../services/notificationService');
const caTrackingService = require('../services/caTrackingService');
const { enqueueEmail } = require('../services/jobQueue');
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

/**
 * May this teacher enter or amend scores for a subject in a class?
 *
 * A teacher is scoped to the subjects they actually teach, plus full access to
 * the class they are form teacher of. Previously any Teacher account could
 * write scores for any subject in any class, and read any class's results.
 *
 * Returns an error message, or null when permitted.
 */
const checkTeacherSubjectAccess = (user, { classId, subjectId }) => {
  if (user.role === 'Admin') return null;
  if (user.role !== 'Teacher') return 'Access denied.';

  const profile = user.teacherProfile || {};

  // Form teacher of this class — full access to it.
  if (
    classId &&
    profile.classTeacherOf &&
    String(profile.classTeacherOf) === String(classId)
  ) {
    return null;
  }

  const taught = (profile.subjectsTaught || []).map(String);
  if (subjectId && taught.includes(String(subjectId))) return null;

  return 'You can only manage results for the subjects you teach.';
};

/**
 * Subjects a teacher may see results for in a given class.
 * `null` means unrestricted (Admin, or the class's form teacher).
 */
const visibleSubjectsForTeacher = (user, classId) => {
  if (user.role === 'Admin') return null;

  const profile = user.teacherProfile || {};
  if (
    profile.classTeacherOf &&
    String(profile.classTeacherOf) === String(classId)
  ) {
    return null;
  }

  return (profile.subjectsTaught || []).map(String);
};

// @desc    Enter/update scores for a student subject
// @route   POST /api/v1/results
// @access  Teacher, Admin
const upsertResult = async (req, res) => {
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

  const scopeDenied = checkTeacherSubjectAccess(req.user, {
    classId,
    subjectId: subject,
  });
  if (scopeDenied) return sendError(res, 403, scopeDenied);

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
};

// @desc    Bulk upload results for an entire class/subject
// @route   POST /api/v1/results/bulk
// @access  Teacher, Admin
const bulkUpsertResults = async (req, res) => {
  const { class: classId, subject, term, academicYear, results } = req.body;

  if (!Array.isArray(results) || !results.length) {
    return sendError(res, 400, 'Results array is required');
  }

  const scopeDenied = checkTeacherSubjectAccess(req.user, {
    classId,
    subjectId: subject,
  });
  if (scopeDenied) return sendError(res, 403, scopeDenied);

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
};

// @desc    Compute positions and class stats, then publish
// @route   POST /api/v1/results/publish
// @access  Admin
const publishResults = async (req, res) => {
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

      const { success } = await enqueueEmail({
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
    `Result notifications for ${term} ${academicYear}: ${sent} queued, ${skipped} skipped`,
  );
  return { sent, skipped };
};

// @desc    Get report card for a student
// @route   GET /api/v1/results/report-card/:studentId
// @access  Admin, Teacher, Student (own), Parent (own child)
const getReportCard = async (req, res) => {
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
};

// @desc    Get all results for a class/term (for teacher view)
// @route   GET /api/v1/results/class/:classId
// @access  Teacher, Admin
const getClassResults = async (req, res) => {
  const { classId } = req.params;
  const { term, academicYear, subject } = req.query;

  const filter = { class: classId };
  if (term) filter.term = term;
  if (academicYear) filter.academicYear = academicYear;

  // A subject teacher sees only their own subjects here; the class's form
  // teacher and Admins see everything.
  const allowedSubjects = visibleSubjectsForTeacher(req.user, classId);

  if (allowedSubjects) {
    if (!allowedSubjects.length) {
      return sendError(
        res,
        403,
        'You are not assigned to any subject in this class.',
      );
    }

    if (subject && !allowedSubjects.includes(String(subject))) {
      return sendError(res, 403, 'You do not teach that subject.');
    }

    filter.subject = subject || { $in: allowedSubjects };
  } else if (subject) {
    filter.subject = subject;
  }

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
};

// @desc    Get student's result history across terms
// @route   GET /api/v1/results/student/:studentId/history
// @access  Admin, Teacher, Student (own), Parent (child)
const getStudentResultHistory = async (req, res) => {
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
};

module.exports = {
  upsertResult,
  bulkUpsertResults,
  publishResults,
  getReportCard,
  getClassResults,
  getStudentResultHistory,
};
