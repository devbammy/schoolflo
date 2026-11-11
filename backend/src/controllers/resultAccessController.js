const User = require('../models/User');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const audit = require('../services/auditService');
const { isEnabled } = require('../config/features');
const {
  accessModeOf,
  unpaidFeesFor,
} = require('../services/resultAccessService');

const ACCESS_FIELDS =
  'firstName lastName role studentProfile.class studentProfile.enrolments studentProfile.profileStatus studentProfile.resultsRelease studentProfile.resultsWithheld';

const findStudent = async (id) => {
  const student = await User.findById(id).select(ACCESS_FIELDS);
  if (!student || student.role !== 'Student') {
    throw AppError.notFound('Student not found');
  }
  return student;
};

const MESSAGES = {
  open: 'Results will be shown to this student and their parents, whatever is owed',
  withheld:
    'Results are withheld from this student and their parents, whatever is paid',
  auto: 'Results now follow the school rule',
};

const ACTIONS = {
  open: 'results.release',
  withheld: 'results.withhold',
  auto: 'results.access_auto',
};

/**
 * What the admin sees for one student: the setting, who made it and why, and
 * where the fee rule alone would leave this student.
 */
const describeResultsAccess = async (studentOrId) => {
  const student =
    studentOrId?.studentProfile !== undefined
      ? studentOrId
      : await findStudent(studentOrId);
  const profile = student.studentProfile || {};
  const mode = accessModeOf(student);
  const setting =
    mode === 'open'
      ? profile.resultsRelease
      : mode === 'withheld'
        ? profile.resultsWithheld
        : null;

  const by = setting?.by
    ? await User.findById(setting.by).select('firstName lastName')
    : null;

  // The fee standing is worked out even when an admin setting overrides it,
  // so the admin can see what "Automatic" would do before choosing it.
  const feeRule = isEnabled('resultsRequireFees');
  const unpaid = feeRule ? await unpaidFeesFor(student) : [];
  const outstanding = unpaid.reduce((sum, fee) => sum + fee.outstanding, 0);

  return {
    mode,
    feeRule,
    unpaid,
    outstanding,
    // Can the family see results right now? Under the fee rule a student who
    // owes for a later term still sees earlier, paid terms; this answers for
    // the fees as they stand, which is what the admin is deciding about.
    visible:
      mode === 'open' || (mode === 'auto' && (!feeRule || outstanding === 0)),
    setBy: by ? `${by.firstName} ${by.lastName}` : null,
    setAt: setting?.at || null,
    note: setting?.note || null,
  };
};

// @desc    A student's results access, for the admin
// @route   GET /api/v1/users/:id/results-access
// @access  Admin
const getResultsAccess = async (req, res) => {
  const student = await findStudent(req.params.id);
  return sendSuccess(res, 200, 'Results access', {
    resultsAccess: await describeResultsAccess(student),
  });
};

// @desc    Show, withhold, or return to the school rule, for one student
// @route   PUT /api/v1/users/:id/results-access   { mode, note }
// @access  Admin
//
// mode: 'open' shows results whatever is owed (a scholarship, a payment plan,
// a staff child); 'withheld' hides them whatever is paid (a matter the school
// is settling with the family); 'auto' follows the school rule. Without
// 'open', the office's only way to release a report card was to record a
// payment that never happened, which corrupts the ledger the bursar reconciles.
//
// Written with updateOne by path rather than a profile form, so nothing else
// in studentProfile is touched (see utils/userUpdate.js for why that matters).
const setResultsAccess = async (req, res) => {
  const { mode, note } = req.body;
  const student = await findStudent(req.params.id);
  const before = accessModeOf(student);

  const stamp = { by: req.user._id, at: new Date(), note: note || undefined };
  const update = {
    open: {
      $set: { 'studentProfile.resultsRelease': stamp },
      $unset: { 'studentProfile.resultsWithheld': '' },
    },
    withheld: {
      $set: { 'studentProfile.resultsWithheld': stamp },
      $unset: { 'studentProfile.resultsRelease': '' },
    },
    auto: {
      $unset: {
        'studentProfile.resultsRelease': '',
        'studentProfile.resultsWithheld': '',
      },
    },
  }[mode];

  await User.updateOne({ _id: student._id }, update);

  await audit.record(req, {
    action: ACTIONS[mode],
    entity: 'User',
    entityId: student._id,
    entityLabel: `${student.firstName} ${student.lastName}`,
    subject: student._id,
    changes: audit.diff(
      { resultsAccess: before },
      { resultsAccess: mode, ...(note && mode !== 'auto' ? { note } : {}) },
    ),
  });

  return sendSuccess(res, 200, MESSAGES[mode], {
    resultsAccess: await describeResultsAccess(student._id),
  });
};

module.exports = { getResultsAccess, setResultsAccess, describeResultsAccess };
