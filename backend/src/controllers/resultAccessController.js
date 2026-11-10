const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const audit = require('../services/auditService');
const { getResultLock } = require('../services/resultAccessService');

// @desc    Show a student's results despite unpaid fees, or withdraw that
// @route   PUT /api/v1/users/:id/results-release   { release, note }
// @access  Admin
//
// For a scholarship, an agreed payment plan, a staff child. Without it the
// office's only way to let a family see a report card was to record a payment
// that never happened, which corrupts the ledger the bursar reconciles.
//
// Written with updateOne by path rather than a profile form, so nothing else
// in studentProfile is touched (see utils/userUpdate.js for why that matters).
const setResultsRelease = async (req, res) => {
  const { release, note } = req.body;

  const student = await User.findById(req.params.id).select(
    'firstName lastName role studentProfile.resultsRelease',
  );
  if (!student || student.role !== 'Student') {
    throw AppError.notFound('Student not found');
  }

  const before = student.studentProfile?.resultsRelease?.at
    ? { released: true, note: student.studentProfile.resultsRelease.note }
    : { released: false };

  if (release) {
    await User.updateOne(
      { _id: student._id },
      {
        $set: {
          'studentProfile.resultsRelease': {
            by: req.user._id,
            at: new Date(),
            note: note || undefined,
          },
        },
      },
    );
  } else {
    await User.updateOne(
      { _id: student._id },
      { $unset: { 'studentProfile.resultsRelease': '' } },
    );
  }

  await audit.record(req, {
    action: release ? 'results.release' : 'results.release_withdrawn',
    entity: 'User',
    entityId: student._id,
    entityLabel: `${student.firstName} ${student.lastName}`,
    subject: student._id,
    changes: audit.diff(before, {
      released: Boolean(release),
      ...(release && note ? { note } : {}),
    }),
  });

  return sendSuccess(
    res,
    200,
    release
      ? 'Results released despite the balance'
      : 'Results locked again until fees are paid',
    { resultsAccess: await describeResultsAccess(student._id) },
  );
};

/**
 * What the admin sees on a student's profile: whether the school locks
 * results, whether this student is locked out, over which fees, and whether
 * an exception is in place and who made it.
 */
const describeResultsAccess = async (studentId) => {
  const lock = await getResultLock(studentId);
  if (!lock.enforced) return { enforced: false };

  if (lock.released) {
    const by = lock.release.by
      ? await User.findById(lock.release.by).select('firstName lastName')
      : null;
    return {
      enforced: true,
      released: true,
      releasedAt: lock.release.at,
      releasedBy: by ? `${by.firstName} ${by.lastName}` : null,
      note: lock.release.note || null,
    };
  }

  return {
    enforced: true,
    released: false,
    unpaid: lock.unpaid,
    outstanding: lock.unpaid.reduce((sum, fee) => sum + fee.outstanding, 0),
  };
};

module.exports = { setResultsRelease, describeResultsAccess };
