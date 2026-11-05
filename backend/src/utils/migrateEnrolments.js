/**
 * Fill in `studentProfile.enrolments` for students promoted before it existed.
 *
 * Without this a student promoted last year has no record of the class they left,
 * so that year's fees stop applying to them. The evidence is what was actually
 * filed against them: a result or a register entry names the class and session.
 * Promotion batches are not used, because nothing recorded whether an old batch
 * was ever applied.
 *
 * The session in progress is skipped for a student still enrolled. Their current
 * class already speaks for it, and an admin who moved a child mid-year would
 * otherwise lose the new class's fee to the evidence from the old one.
 *
 * Read-only by default. Only ever adds entries.
 *
 *   node src/utils/migrateEnrolments.js            # report only
 *   node src/utils/migrateEnrolments.js --apply    # write
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const AcademicCalendar = require('../models/AcademicCalendar');
const { Result } = require('../models/Exam');
const { FINISHED_STATUSES } = require('./enrolment');

const APPLY = process.argv.includes('--apply');

const evidenceFor = async (Model, studentIds) =>
  Model.aggregate([
    {
      $match: {
        student: { $in: studentIds },
        class: { $ne: null },
        academicYear: { $nin: [null, ''] },
      },
    },
    {
      $group: {
        _id: {
          student: '$student',
          class: '$class',
          academicYear: '$academicYear',
        },
      },
    },
  ]);

/**
 * The entries a student is missing. Pure, so it can be tested without a database.
 */
const missingEnrolments = (student, evidence, activeYear) => {
  const stillEnrolled = !FINISHED_STATUSES.includes(
    student.studentProfile?.profileStatus,
  );
  const known = new Set(
    (student.studentProfile?.enrolments || []).map(
      (e) => `${e.class}:${e.academicYear}`,
    ),
  );

  const missing = new Map();
  evidence.forEach(({ class: classId, academicYear }) => {
    if (stillEnrolled && academicYear === activeYear) return;
    const key = `${classId}:${academicYear}`;
    if (!known.has(key)) missing.set(key, { class: classId, academicYear });
  });

  return [...missing.values()];
};

const run = async () => {
  await connectDB();

  const calendar = await AcademicCalendar.findOne({ isActive: true })
    .select('academicYear')
    .lean();

  if (!calendar) {
    console.warn(
      'No active academic calendar, so no session can be treated as in progress. Review the report before applying.',
    );
  }

  const students = await User.find({ role: 'Student' })
    .select(
      'firstName lastName studentProfile.enrolments studentProfile.profileStatus',
    )
    .lean();

  const ids = students.map((s) => s._id);
  const [fromResults, fromAttendance] = await Promise.all([
    evidenceFor(Result, ids),
    evidenceFor(Attendance, ids),
  ]);

  const byStudent = new Map();
  [...fromResults, ...fromAttendance].forEach(({ _id }) => {
    const key = String(_id.student);
    if (!byStudent.has(key)) byStudent.set(key, []);
    byStudent
      .get(key)
      .push({ class: _id.class, academicYear: _id.academicYear });
  });

  let studentsChanged = 0;
  let entriesAdded = 0;

  for (const student of students) {
    const missing = missingEnrolments(
      student,
      byStudent.get(String(student._id)) || [],
      calendar?.academicYear,
    );
    if (!missing.length) continue;

    studentsChanged += 1;
    entriesAdded += missing.length;
    console.log(
      `  ${student.firstName} ${student.lastName}: ${missing.map((m) => m.academicYear).join(', ')}`,
    );

    if (APPLY) {
      await User.updateOne(
        { _id: student._id },
        { $push: { 'studentProfile.enrolments': { $each: missing } } },
      );
    }
  }

  console.log(
    `${entriesAdded} enrolment(s) across ${studentsChanged} student(s) ${APPLY ? 'written' : 'found (dry run: pass --apply to write)'}.`,
  );

  await mongoose.connection.close();
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { missingEnrolments };
