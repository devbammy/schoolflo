const User = require('../models/User');
const { Result } = require('../models/Exam');
const {
  ReportRemark,
  BEHAVIOUR_TRAITS,
  BEHAVIOUR_RATINGS,
} = require('../models/ReportRemark');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const { assertClassAccess } = require('../utils/teacherScope');
const { ENROLLED_FILTER } = require('../utils/enrolment');
const escapeRegex = require('../utils/escapeRegex');
const audit = require('../services/auditService');

/**
 * Behaviour ratings and the teacher's comment on each report card, entered by
 * the class's form teacher (or an admin). Not by subject teachers: the school
 * wants one voice per child, and these are about the child, not a subject.
 *
 * Locked to teachers once the class's results for the term are published, the
 * same as scores, so what a parent read is not quietly changed afterwards.
 */

const isPublished = (classId, term, academicYear) =>
  Result.exists({ class: classId, term, academicYear, isPublished: true });

const sectionFilter = (section) =>
  section
    ? {
        'studentProfile.section': new RegExp(
          `^${escapeRegex(String(section).trim())}$`,
          'i',
        ),
      }
    : {};

// @desc    The class (or one arm), with each student's behaviour and comment
// @route   GET /api/v1/report-remarks?class=&term=&academicYear=&section=
// @access  Form teacher of the class, Admin
const getClassRemarks = async (req, res) => {
  const { class: classId, term, academicYear, section } = req.query;
  await assertClassAccess(req.user, classId);

  const students = await User.find({
    role: 'Student',
    'studentProfile.class': classId,
    ...ENROLLED_FILTER,
    ...sectionFilter(section),
  })
    .select(
      'firstName lastName studentProfile.section studentProfile.admissionNumber',
    )
    .collation({ locale: 'en', strength: 2 })
    .sort({ lastName: 1, firstName: 1 })
    .lean();

  const remarks = await ReportRemark.find({
    student: { $in: students.map((s) => s._id) },
    term,
    academicYear,
  })
    .select('student behaviour teacherComment')
    .lean();
  const byStudent = new Map(remarks.map((r) => [String(r.student), r]));

  const published = Boolean(await isPublished(classId, term, academicYear));

  return sendSuccess(res, 200, 'Report remarks', {
    traits: BEHAVIOUR_TRAITS,
    ratings: BEHAVIOUR_RATINGS,
    published,
    locked: published && req.user.role !== 'Admin',
    students: students.map((s) => {
      const remark = byStudent.get(String(s._id));
      return {
        _id: s._id,
        firstName: s.firstName,
        lastName: s.lastName,
        section: s.studentProfile?.section || null,
        admissionNumber: s.studentProfile?.admissionNumber || null,
        behaviour: remark?.behaviour || {},
        teacherComment: remark?.teacherComment || '',
      };
    }),
  });
};

// @desc    Save behaviour ratings and comments for students of one class
// @route   PUT /api/v1/report-remarks   { class, term, academicYear, remarks }
// @access  Form teacher of the class, Admin
const saveClassRemarks = async (req, res) => {
  const { class: classId, term, academicYear, remarks } = req.body;
  await assertClassAccess(req.user, classId);

  if (
    req.user.role !== 'Admin' &&
    (await isPublished(classId, term, academicYear))
  ) {
    throw AppError.forbidden(
      'Results for this class and term are published, so behaviour and comments are locked. Ask an administrator to correct them.',
    );
  }

  // Every row must be a student of this class, or nothing is saved: a form
  // teacher's access is to their class, not to whichever id the browser sent.
  const ids = remarks.map((r) => r.student);
  const inClass = await User.countDocuments({
    _id: { $in: ids },
    role: 'Student',
    'studentProfile.class': classId,
  });
  if (inClass !== new Set(ids.map(String)).size) {
    throw AppError.badRequest(
      'Some of these students are not in this class. Nothing was saved.',
    );
  }

  // ReportRemark has no save hooks, so a bulkWrite loses nothing. Only the
  // traits sent are written, each by its own path, so saving one column does
  // not blank the others.
  const operations = remarks.map(
    ({ student, behaviour = {}, teacherComment }) => {
      const set = { class: classId, enteredBy: req.user._id };
      const unset = {};
      BEHAVIOUR_TRAITS.forEach((trait) => {
        if (!(trait in behaviour)) return;
        if (behaviour[trait]) set[`behaviour.${trait}`] = behaviour[trait];
        else unset[`behaviour.${trait}`] = '';
      });
      if (teacherComment !== undefined) {
        if (teacherComment) set.teacherComment = teacherComment;
        else unset.teacherComment = '';
      }
      return {
        updateOne: {
          filter: { student, term, academicYear },
          update: {
            $set: set,
            ...(Object.keys(unset).length ? { $unset: unset } : {}),
            $setOnInsert: { student, term, academicYear },
          },
          upsert: true,
        },
      };
    },
  );

  await ReportRemark.bulkWrite(operations);

  await audit.record(req, {
    action: 'report.remarks',
    entity: 'ReportRemark',
    entityLabel: `${remarks.length} student(s), ${term} ${academicYear}`,
    meta: { class: classId, term, academicYear, students: remarks.length },
  });

  return sendSuccess(res, 200, `Saved for ${remarks.length} student(s)`, {
    saved: remarks.length,
  });
};

module.exports = { getClassRemarks, saveClassRemarks };
