/**
 * Who is enrolled, and in which class they were in a given session.
 *
 * `studentProfile.class` only ever says where a student is NOW. Everything that
 * asks about the past used to read it anyway: promoting a child from JSS1 to
 * JSS2 made their unpaid JSS1 fees vanish from the parent's page and billed
 * them for last year's JSS2 fees instead, so the financial report for a closed
 * session changed every time a batch was applied.
 *
 * `studentProfile.enrolments` is the record of where a student WAS. A promotion
 * writes it when applied; `pnpm migrate:enrolments` fills it in for students
 * promoted before it existed.
 */

// Graduates keep their last class so their records still read properly, which
// means "has this class id" is not the same as "is in this class". Every roster
// has to ask this as well. Suspended is left off too: a suspended student is not
// marked present and is not billed by the ledger.
const ENROLLED_FILTER = {
  'studentProfile.profileStatus': { $in: ['Active', null] },
  isActive: { $ne: false },
};

const FINISHED_STATUSES = ['Graduated', 'Withdrawn'];

const idOf = (value) => String(value?._id || value || '');

/** "2025/2026" -> 2025, so sessions can be ordered. */
const sessionStart = (academicYear) =>
  parseInt(String(academicYear || '').split('/')[0], 10) || 0;

const enrolmentsOf = (student) => student?.studentProfile?.enrolments || [];

/**
 * Was this student in that class during that session?
 *
 * The record wins where there is one. Without one, the current class speaks for
 * every session after the last recorded one and for nothing before it: it cannot
 * say where a child was two years ago.
 */
const inClassDuring = (student, classId, academicYear) => {
  const history = enrolmentsOf(student);
  const thatYear = history.filter((e) => e.academicYear === academicYear);

  if (thatYear.length) {
    return thatYear.some((e) => idOf(e.class) === idOf(classId));
  }

  if (idOf(student?.studentProfile?.class) !== idOf(classId)) return false;
  if (!history.length) return true;

  const latest = Math.max(...history.map((e) => sessionStart(e.academicYear)));
  return sessionStart(academicYear) > latest;
};

/**
 * Does this fee structure apply to this student?
 *
 * A recorded session always counts: a graduate who left owing still owes. The
 * unrecorded path is the student's current class, which only binds someone still
 * on its roster. `excluding` is which statuses end that; the ledger also excludes
 * Suspended, as it always has, while a suspended child's own balance page must
 * still show what the family owes.
 */
const isBilledFor = (student, fee, { excluding = FINISHED_STATUSES } = {}) => {
  const recorded = enrolmentsOf(student).some(
    (e) =>
      e.academicYear === fee.academicYear && idOf(e.class) === idOf(fee.class),
  );
  if (recorded) return true;

  if (excluding.includes(student?.studentProfile?.profileStatus)) return false;

  return inClassDuring(student, fee.class, fee.academicYear);
};

/** Add one session to a loaded student, once. Does not save. */
const recordEnrolment = (student, classId, academicYear) => {
  if (!student.studentProfile.enrolments) {
    student.studentProfile.enrolments = [];
  }

  const already = student.studentProfile.enrolments.some(
    (e) => e.academicYear === academicYear && idOf(e.class) === idOf(classId),
  );

  if (!already) {
    student.studentProfile.enrolments.push({ class: classId, academicYear });
  }
};

module.exports = {
  ENROLLED_FILTER,
  FINISHED_STATUSES,
  sessionStart,
  inClassDuring,
  isBilledFor,
  recordEnrolment,
};
