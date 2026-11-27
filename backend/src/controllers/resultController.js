const { Result, Exam, calculateGrade, roundScore } = require('../models/Exam');
const Class = require('../models/Class');
const User = require('../models/User');
const { checkStudentAccess } = require('../utils/studentAccess');
const {
  canEnterScores,
  getVisibleSubjectIds,
} = require('../utils/teacherScope');
const { inClassDuring } = require('../utils/enrolment');
const { parentsOfStudent } = require('../utils/parentLookup');
const {
  sendSuccess,
  sendError,
  getPaginationParams,
  sendPaginated,
} = require('../utils/apiResponse');
const {
  computeClassStatistics,
  generateReportCard,
  summariseClass,
} = require('../services/gradingService');
const AppError = require('../utils/AppError');
const { signatureDataUrl } = require('./schoolSettingsController');
const { emailTemplates } = require('../services/notificationService');
const caTrackingService = require('../services/caTrackingService');
const { clientUrl } = require('../config/clientUrl');
const { enqueueEmail } = require('../services/jobQueue');
const audit = require('../services/auditService');
const {
  assertResultUnlocked,
  getResultLock,
  getResultLockFor,
} = require('../services/resultAccessService');
const {
  validateScores,
  validateScoreBatch,
} = require('../utils/scoreValidation');

// Centralized calculation. Callers must pass scores that have already been
// through validateScores() — this only computes, it does not check. `level`
// is the class's, because the primary and college scales grade the same
// total differently.
const computeResultFields = (scores = {}, level) => {
  const { ca1 = 0, ca2 = 0, classWork = 0, project = 0, exam = 0 } = scores;

  const totalScore = roundScore(ca1 + ca2 + classWork + project + exam);
  const grading = calculateGrade(totalScore, level);

  return {
    scores: { ca1, ca2, classWork, project, exam },
    totalScore,
    grade: grading.grade,
    remark: grading.remark,
    gradePoint: grading.gradePoint,
  };
};

/**
 * Who may read a given student's academic records.
 *
 * A thin alias over `utils/studentAccess` now. This rule used to live here
 * and only here, so the domains that never copied it — certificates, CA
 * tracking — shipped with no ownership check at all.
 */
const checkResultAccess = (user, studentId) =>
  checkStudentAccess(user, studentId, 'results');

/**
 * May this teacher enter or amend scores for a subject in a class? The rule
 * itself lives in utils/teacherScope.js. Returns a message, or null if permitted.
 */
const checkTeacherSubjectAccess = async (user, { classId, subjectId }) =>
  (await canEnterScores(user, { classId, subjectId }))
    ? null
    : 'You can only manage results for the subjects you teach in this class.';

/**
 * Is this student someone whose score belongs under this class and session?
 * Nothing used to check, so a score could be filed under a class the student was
 * never in, where it then moved that class's averages and positions. A row that
 * already sits under the class passes, so a correction to last year's mark still
 * works after the student has been promoted.
 */
const belongsToClass = (student, classId, academicYear, existing) =>
  student?.role === 'Student' &&
  (inClassDuring(student, classId, academicYear) ||
    String(student.studentProfile?.class) === String(classId) ||
    String(existing?.class) === String(classId));

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

  const scopeDenied = await checkTeacherSubjectAccess(req.user, {
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

  const classLevel = (await Class.findById(classId).select('level').lean())
    ?.level;
  const computed = computeResultFields(validation.scores, classLevel);

  // Captured before the write so the audit entry can show what a score was
  // changed FROM — the question that actually gets asked when a mark is
  // disputed.
  const previous = await Result.findOne({
    student,
    subject,
    term,
    academicYear,
  })
    .select('class scores totalScore grade isPublished')
    .lean();

  if (!belongsToClass(studentUser, classId, academicYear, previous)) {
    return sendError(res, 400, 'This student is not in the selected class.');
  }

  // Once published, a score is on a report card a family may already have
  // seen. A teacher can no longer change it quietly; an admin can, with the
  // audit trail, and the class figures are recomputed below.
  if (previous?.isPublished && req.user.role !== 'Admin') {
    return sendError(
      res,
      403,
      'These results have been published and are locked. Ask an administrator to correct them.',
    );
  }

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

  await audit.record(req, {
    action: previous ? 'result.update' : 'result.create',
    entity: 'Result',
    entityId: result._id,
    entityLabel: result.subject?.name,
    subject: student,
    changes: audit.diff(
      {
        ...previous?.scores,
        totalScore: previous?.totalScore,
        grade: previous?.grade,
      },
      {
        ...computed.scores,
        totalScore: computed.totalScore,
        grade: computed.grade,
      },
    ),
    meta: { term, academicYear, class: classId },
  });

  // A correction to a published score moves the subject's average, highest,
  // lowest and everyone's position in it. Refresh them rather than leave the
  // report cards describing a class that no longer exists.
  if (previous?.isPublished) {
    await computeClassStatistics(classId, term, academicYear);
  }

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

  const scopeDenied = await checkTeacherSubjectAccess(req.user, {
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

  // Every row must belong under this class, or none are saved, for the same
  // reason as an invalid score.
  const studentIds = batch.rows.map((row) => row.student);
  const [batchStudents, existingRows] = await Promise.all([
    User.find({ _id: { $in: studentIds } }).select('role studentProfile'),
    Result.find({ student: { $in: studentIds }, subject, term, academicYear })
      .select('student class')
      .lean(),
  ]);
  const studentById = new Map(batchStudents.map((s) => [String(s._id), s]));
  const existingByStudent = new Map(
    existingRows.map((row) => [String(row.student), row]),
  );

  const foreign = studentIds.filter(
    (id) =>
      !belongsToClass(
        studentById.get(String(id)),
        classId,
        academicYear,
        existingByStudent.get(String(id)),
      ),
  );

  if (foreign.length) {
    return sendError(
      res,
      400,
      `${foreign.length} student(s) are not in the selected class — no results were saved.`,
    );
  }

  // The same lock as the single-score path. Checked before anything is
  // written, and across the whole batch, so a teacher cannot overwrite
  // published marks by sending them through the bulk route.
  const publishedCount = await Result.countDocuments({
    student: { $in: batch.rows.map((row) => row.student) },
    subject,
    term,
    academicYear,
    isPublished: true,
  });

  if (publishedCount > 0 && req.user.role !== 'Admin') {
    return sendError(
      res,
      403,
      `${publishedCount} of these results have been published and are locked. Ask an administrator to correct them.`,
    );
  }

  // bulkWrite skips the save hook that grades a result, so the class's level
  // is read once here and every row is graded on its scale.
  const classLevel = (await Class.findById(classId).select('level').lean())
    ?.level;

  const operations = batch.rows.map(
    ({ student, scores = {}, teacherComment }) => {
      const computed = computeResultFields(scores, classLevel);

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

  // One entry for the batch rather than one per student: the meaningful event
  // is "this teacher entered marks for this class and subject".
  await audit.record(req, {
    action: 'result.bulk_upsert',
    entity: 'Result',
    meta: {
      class: classId,
      subject,
      term,
      academicYear,
      studentCount: batch.rows.length,
      inserted: bulkResult.upsertedCount,
      updated: bulkResult.modifiedCount,
      students: batch.rows.map((row) => String(row.student)),
    },
  });

  if (publishedCount > 0) {
    await computeClassStatistics(classId, term, academicYear);
  }

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
  const statsResult = await computeClassStatistics(classId, term, academicYear);
  if (!statsResult.success) return sendError(res, 400, statsResult.message);

  // Who is about to be published for the first time. Read BEFORE the update:
  // afterwards every student with any published result looks the same, and
  // publishing a late subject re-emailed every parent in the class.
  const newlyPublishedStudents = await Result.find({
    class: classId,
    term,
    academicYear,
    isPublished: false,
  }).distinct('student');

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

  // Step 4: Only the students whose results were released just now.
  const studentsForNotification = newlyPublishedStudents;

  // Fire notifications async (don't block response)
  notifyParentsOfResults(studentsForNotification, term, academicYear).catch(
    console.error,
  );

  await audit.record(req, {
    action: 'result.publish',
    entity: 'Result',
    meta: {
      class: classId,
      term,
      academicYear,
      published: updated.modifiedCount,
      statsProcessed: statsResult.processed,
      studentsNotified: studentsForNotification.length,
    },
  });

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

      const student = await User.findById(studentId).select(
        'firstName lastName studentProfile.parentId',
      );

      const parents = student
        ? (await parentsOfStudent(student, 'email firstName')).filter(
            (parent) => parent.email,
          )
        : [];
      if (!parents.length) {
        skipped += 1;
        continue;
      }

      const { average, overallPosition, totalStudentsInClass } =
        reportCard.summary;

      // A parent the portal would refuse the result to must not be emailed
      // the average and position instead. They are told it is ready, and what
      // is owed, and nothing about how the child did.
      const lock = (await getResultLock(studentId)).lockFor(term, academicYear);
      if (lock.locked) {
        for (const parent of parents) {
          const { success } = await enqueueEmail({
            to: parent.email,
            subject: `${term} results for ${student.firstName} ${student.lastName}`,
            html: emailTemplates.resultWithheld({
              studentName: `${student.firstName} ${student.lastName}`,
              term,
              academicYear,
              // None when an admin withheld it: there is nothing to pay.
              outstanding: lock.withheld
                ? null
                : `₦${lock.outstanding.toLocaleString('en-NG')}`,
              loginUrl: `${clientUrl()}/login`,
            }),
          });
          if (success) sent += 1;
          else skipped += 1;
        }
        continue;
      }

      for (const parent of parents) {
        const { success } = await enqueueEmail({
          to: parent.email,
          subject: `${term} results for ${student.firstName} ${student.lastName}`,
          html: emailTemplates.resultPublished({
            studentName: `${student.firstName} ${student.lastName}`,
            term,
            academicYear,
            average,
            position: `${overallPosition} of ${totalStudentsInClass}`,
            loginUrl: `${clientUrl()}/login`,
          }),
        });

        if (success) sent += 1;
        else skipped += 1;
      }
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

  // Before the card is built: a family with fees outstanding gets the balance
  // instead (402). Printing goes through this same request.
  await assertResultUnlocked(req.user, studentId, term, academicYear);

  // A card compares the student with their arm. Staff may ask for the whole
  // class instead (?scope=class); a family always sees the arm, as printed.
  const scope =
    req.query.scope === 'class' && ['Admin', 'Teacher'].includes(req.user.role)
      ? 'class'
      : 'arm';

  const reportCard = await generateReportCard(studentId, term, academicYear, {
    scope,
  });
  if (!reportCard)
    return sendError(res, 404, 'No published results found for this term');

  const student = await User.findById(studentId)
    .select('firstName lastName studentProfile avatar')
    .populate('studentProfile.class', 'name level');

  // The legend travels with the card (reportCard.gradeScale), on the class's
  // own scale. The printable component used to carry a hardcoded copy of the
  // ladder, so a school adjusting its scale got a card whose table and whose
  // legend disagreed.
  return sendSuccess(res, 200, 'Report card fetched', {
    student,
    // The head's signature travels only inside a card, to someone allowed to
    // see it; it has no URL of its own (see SchoolSettings).
    signature: await signatureDataUrl(),
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
  const allowedSubjects = await getVisibleSubjectIds(req.user, classId);

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

  // A term whose fees are not cleared is listed without its scores, so the
  // family sees that a result exists and what stands in the way of it.
  const lock = await getResultLockFor(req.user, studentId);
  const locked = new Map();

  // Group by academicYear + term
  const grouped = {};
  results.forEach((r) => {
    if (lock.isLocked(r.term, r.academicYear)) {
      const key = `${r.academicYear} — ${r.term}`;
      if (!locked.has(key)) {
        locked.set(key, {
          term: r.term,
          academicYear: r.academicYear,
          ...lock.lockFor(r.term, r.academicYear),
        });
      }
      return;
    }
    const key = `${r.academicYear} — ${r.term}`;
    if (!grouped[key])
      grouped[key] = {
        term: r.term,
        academicYear: r.academicYear,
        subjects: [],
      };
    grouped[key].subjects.push(r);
  });

  const visible = Object.values(grouped);

  return sendSuccess(res, 200, 'Result history fetched', {
    history: visible,
    locked: [...locked.values()],
    total: visible.reduce((n, g) => n + g.subjects.length, 0),
  });
};

// @desc    A class's standings for a term: by arm, or the whole class
// @route   GET /api/v1/results/class/:classId/summary?term=&academicYear=&section=
// @access  Admin
const getClassSummary = async (req, res) => {
  const { classId } = req.params;
  const { term, academicYear, section } = req.query;
  if (!term || !academicYear) {
    throw AppError.badRequest('Term and academicYear are required');
  }
  const summary = await summariseClass(classId, term, academicYear, {
    section: section || undefined,
  });
  return sendSuccess(res, 200, 'Class summary', summary);
};

module.exports = {
  getClassSummary,
  upsertResult,
  bulkUpsertResults,
  publishResults,
  getReportCard,
  getClassResults,
  getStudentResultHistory,
  // Exported for tests: it runs in the background after a publish responds.
  notifyParentsOfResults,
};
