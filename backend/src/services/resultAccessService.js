const User = require('../models/User');
const AppError = require('../utils/AppError');
const { TERMS } = require('../config/constants');
const { isEnabled } = require('../config/features');
const { sessionStart } = require('../utils/enrolment');
const { billedFeesFor, getFeeBalances } = require('./paymentService');

/**
 * Who may see a student's results, as a student or parent.
 *
 * Two things decide it.
 *
 * **The school's fee rule** (`resultsRequireFees`, off unless turned on): a
 * term's result is locked while that term's fee, or any fee from before it,
 * has anything outstanding. Paying next term early is not required to see this
 * one, but an old debt cannot be skipped by paying the newest fee. A
 * part-payment does not count as paid. Off by default because it withholds
 * something: on by default, an upgrade would have locked every existing
 * school's results overnight.
 *
 * **An admin's setting for one student**, which wins over the rule:
 *
 * | Setting   | Stored as                        | Effect                                  |
 * | --------- | -------------------------------- | --------------------------------------- |
 * | automatic | neither field                    | the fee rule, or open if the rule is off |
 * | open      | `studentProfile.resultsRelease`  | shown whatever is owed                  |
 * | withheld  | `studentProfile.resultsWithheld` | hidden whatever is paid, rule on or off  |
 *
 * "Open" came first, for scholarships and payment plans. "Withheld" was asked
 * for next: a school sometimes holds one child's report back for a reason that
 * has nothing to do with fees (a disciplinary matter, an unreturned textbook),
 * and the office had no way to do it. Only one of the two fields is ever set.
 *
 * Who it applies to: a student looking at their own results and a parent
 * looking at a child's. Staff are never locked out.
 *
 * Every surface that shows a score asks here: the report card, the results
 * history, CA tracking, both dashboards, and the "results published" email,
 * which used to put the average and class position in the inbox of a parent
 * the portal was refusing to show them to.
 */

const LOCKED_ROLES = ['Student', 'Parent'];
const TERM_ORDER = Object.values(TERMS);
const ACCESS_MODES = ['auto', 'open', 'withheld'];

// Where a term sits in time. Sessions first, then the term within one.
const periodOf = (term, academicYear) =>
  sessionStart(academicYear) * 10 + Math.max(0, TERM_ORDER.indexOf(term));

const UNLOCKED = Object.freeze({
  enforced: false,
  released: false,
  withheld: false,
  unpaid: [],
  isLocked: () => false,
  lockFor: () => ({ locked: false, outstanding: 0, fees: [] }),
});

const withheldLock = (hold) => ({
  enforced: true,
  released: false,
  withheld: true,
  hold,
  unpaid: [],
  isLocked: () => true,
  lockFor: () => ({ locked: true, withheld: true, outstanding: 0, fees: [] }),
});

/** The admin's setting for this student: 'auto', 'open' or 'withheld'. */
const accessModeOf = (student) => {
  const profile = student?.studentProfile || {};
  if (profile.resultsWithheld?.at) return 'withheld';
  if (profile.resultsRelease?.at) return 'open';
  return 'auto';
};

/**
 * What this student still owes, fee by fee, ignoring any admin setting. The
 * fee page reads the same list (paymentService.billedFeesFor), so a family is
 * never locked over a debt they cannot see.
 */
const unpaidFeesFor = async (student) => {
  const fees = await billedFeesFor(student);
  return (await getFeeBalances(student._id, fees))
    .filter((b) => b.outstanding > 0)
    .map((b) => ({
      feeStructure: String(b.feeStructure._id),
      title: b.feeStructure.title,
      term: b.feeStructure.term,
      academicYear: b.feeStructure.academicYear,
      outstanding: b.outstanding,
    }));
};

const STUDENT_FIELDS =
  'role studentProfile.class studentProfile.enrolments studentProfile.profileStatus studentProfile.resultsRelease studentProfile.resultsWithheld';

/**
 * The lock for one student, computed once and asked about many terms.
 *
 * Returns `isLocked(term, year)` and `lockFor(term, year)`, the second also
 * saying which fees are in the way and how much is owed, which is what the
 * family needs to see instead of the result.
 */
const getResultLock = async (studentOrId) => {
  const student = await User.findById(studentOrId?._id || studentOrId).select(
    STUDENT_FIELDS,
  );
  if (!student) return UNLOCKED;

  // Checked before the school rule: a withheld result stays withheld at a
  // school that does not lock over fees at all.
  const mode = accessModeOf(student);
  if (mode === 'withheld') {
    return withheldLock(student.studentProfile.resultsWithheld);
  }

  if (!isEnabled('resultsRequireFees')) return UNLOCKED;

  if (mode === 'open') {
    return {
      ...UNLOCKED,
      enforced: true,
      released: true,
      release: student.studentProfile.resultsRelease,
    };
  }

  const unpaid = (await unpaidFeesFor(student)).map((fee) => ({
    ...fee,
    period: periodOf(fee.term, fee.academicYear),
  }));

  const blocking = (term, academicYear) => {
    const at = periodOf(term, academicYear);
    return unpaid.filter((fee) => fee.period <= at);
  };

  return {
    enforced: true,
    released: false,
    withheld: false,
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
 * Over fees: 402, not 403. The viewer is allowed to see this child's results;
 * what stands in the way is a debt, so the client shows the balance and the
 * fee page rather than "access denied".
 *
 * Withheld by the school: 403. There is nothing to pay, and saying how much
 * is owed would be wrong; the family is sent to the office. Neither message
 * says why the school is holding the result: that is for the office to tell.
 */
const lockedError = (term, academicYear, lock) => {
  if (lock.withheld) {
    return new AppError(
      403,
      'The school is holding these results. Please contact the school office.',
      { reason: 'RESULTS_WITHHELD', term, academicYear },
    );
  }

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

/** Throws when this viewer may not see this term yet. */
const assertResultUnlocked = async (user, studentId, term, academicYear) => {
  const lock = await getResultLockFor(user, studentId);
  const forTerm = lock.lockFor(term, academicYear);
  if (forTerm.locked) throw lockedError(term, academicYear, forTerm);
};

module.exports = {
  ACCESS_MODES,
  accessModeOf,
  unpaidFeesFor,
  getResultLock,
  getResultLockFor,
  assertResultUnlocked,
  lockedError,
  viewerIsLockable,
  periodOf,
};
