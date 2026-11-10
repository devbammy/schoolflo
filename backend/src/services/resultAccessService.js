const User = require('../models/User');
const AppError = require('../utils/AppError');
const { TERMS } = require('../config/constants');
const { isEnabled } = require('../config/features');
const { sessionStart } = require('../utils/enrolment');
const { billedFeesFor, getFeeBalances } = require('./paymentService');

/**
 * Results held back until fees are paid.
 *
 * A school that withholds report cards from families who owe asked for it, and
 * the rule they chose is: **a term's result is locked while that term's fee,
 * or any fee from before it, has anything outstanding.** Paying next term
 * early is not required to see this one, but an old debt cannot be skipped
 * past by paying the newest fee. A part-payment does not count as paid.
 *
 * Who it applies to: a student looking at their own results and a parent
 * looking at a child's. Staff are never locked out. An admin may release one
 * student's results despite a balance (`studentProfile.resultsRelease`), which
 * is audited and can be withdrawn.
 *
 * Off unless the school turns it on (`resultsRequireFees`), because it
 * withholds something: on by default, an upgrade would have locked every
 * existing school's results overnight.
 *
 * Every surface that shows a score asks here: the report card, the results
 * history, CA tracking, both dashboards, and the "results published" email,
 * which used to put the average and class position in the inbox of a parent
 * the portal was refusing to show them to.
 */

const LOCKED_ROLES = ['Student', 'Parent'];
const TERM_ORDER = Object.values(TERMS);

// Where a term sits in time. Sessions first, then the term within one.
const periodOf = (term, academicYear) =>
  sessionStart(academicYear) * 10 + Math.max(0, TERM_ORDER.indexOf(term));

const UNLOCKED = Object.freeze({
  enforced: false,
  released: false,
  isLocked: () => false,
  lockFor: () => ({ locked: false, outstanding: 0, fees: [] }),
});

/**
 * The lock for one student, computed once and asked about many terms.
 *
 * Returns `isLocked(term, year)` and `lockFor(term, year)`, the second also
 * saying which fees are in the way and how much is owed, which is what the
 * family needs to see instead of the result.
 */
const getResultLock = async (studentOrId) => {
  if (!isEnabled('resultsRequireFees')) return UNLOCKED;

  const student =
    studentOrId && studentOrId.studentProfile
      ? studentOrId
      : await User.findById(studentOrId).select(
          'role studentProfile.class studentProfile.enrolments studentProfile.profileStatus studentProfile.resultsRelease',
        );
  if (!student) return UNLOCKED;

  const release = student.studentProfile?.resultsRelease;
  if (release?.at) {
    return { ...UNLOCKED, enforced: true, released: true, release };
  }

  const fees = await billedFeesFor(student);
  const unpaid = (await getFeeBalances(student._id, fees))
    .filter((b) => b.outstanding > 0)
    .map((b) => ({
      feeStructure: String(b.feeStructure._id),
      title: b.feeStructure.title,
      term: b.feeStructure.term,
      academicYear: b.feeStructure.academicYear,
      outstanding: b.outstanding,
      period: periodOf(b.feeStructure.term, b.feeStructure.academicYear),
    }));

  const blocking = (term, academicYear) => {
    const at = periodOf(term, academicYear);
    return unpaid.filter((fee) => fee.period <= at);
  };

  return {
    enforced: true,
    released: false,
    unpaid: unpaid.map(({ period, ...fee }) => fee),
    isLocked: (term, academicYear) => blocking(term, academicYear).length > 0,
    lockFor: (term, academicYear) => {
      const fees = blocking(term, academicYear).map(
        ({ period, ...fee }) => fee,
      );
      return {
        locked: fees.length > 0,
        outstanding: fees.reduce((sum, fee) => sum + fee.outstanding, 0),
        fees,
      };
    },
  };
};

/** Does this viewer see results only once fees are paid? */
const viewerIsLockable = (user) => LOCKED_ROLES.includes(user?.role);

/** The lock as this viewer meets it: staff always see everything. */
const getResultLockFor = async (user, studentOrId) =>
  viewerIsLockable(user) ? getResultLock(studentOrId) : UNLOCKED;

/**
 * The error a locked result answers with.
 *
 * 402, not 403. The viewer is allowed to see this child's results; what stands
 * in the way is a debt, and the client shows the balance and a way to pay
 * rather than "access denied". `errors` carries what that screen needs.
 */
const lockedError = (term, academicYear, lock) => {
  const naira = `₦${lock.outstanding.toLocaleString('en-NG')}`;
  return new AppError(
    402,
    `${term} ${academicYear} results are available once fees are paid in full. ${naira} is outstanding.`,
    {
      reason: 'FEES_OUTSTANDING',
      term,
      academicYear,
      outstanding: lock.outstanding,
      fees: lock.fees,
    },
  );
};

/** Throws the 402 when this viewer may not see this term yet. */
const assertResultUnlocked = async (user, studentId, term, academicYear) => {
  const lock = await getResultLockFor(user, studentId);
  const forTerm = lock.lockFor(term, academicYear);
  if (forTerm.locked) throw lockedError(term, academicYear, forTerm);
};

module.exports = {
  getResultLock,
  getResultLockFor,
  assertResultUnlocked,
  lockedError,
  viewerIsLockable,
  periodOf,
};
