const User = require('../models/User');
const Session = require('../models/Session');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const { readablePassword } = require('../utils/loginPassword');
const { shownEmail } = require('../utils/mailbox');
const audit = require('../services/auditService');

// @desc    Give a student a new password, to hand over on a printed slip
// @route   POST /api/v1/users/:id/login-slip
// @access  Admin
//
// For the student who lost their slip or forgot the password they chose. A
// student with no email cannot use "Forgot password", because there is
// nowhere to send the link, so this is the only way back in.
//
// The password is returned once, to the admin who asked, and stored only as
// its hash. Every session the student had is ended, so whoever was signed in
// with the old password is not still signed in.
const issueLoginSlip = async (req, res) => {
  const student = await User.findById(req.params.id).populate(
    'studentProfile.class',
    'name',
  );

  if (!student || student.role !== 'Student') {
    throw AppError.notFound('Student not found');
  }

  const password = readablePassword();
  student.password = password;

  // Validation is skipped because a record written before the profile-edit fix
  // can hold a value the schema now refuses (an empty gender, say), and a
  // child should not be locked out of their account over it. The password
  // hash is a pre('save') hook, so it still runs.
  await student.save({ validateBeforeSave: false });

  await Session.deleteMany({ user: student._id });

  await audit.record(req, {
    // Its own action, so the log tells an admin's reset apart from a student
    // resetting their own through the emailed link (auth.password_reset).
    action: 'auth.login_slip',
    entity: 'User',
    entityId: student._id,
    entityLabel: `${student.firstName} ${student.lastName}`,
    subject: student._id,
    meta: {
      admissionNumber: student.studentProfile?.admissionNumber,
    },
  });

  res.set('Cache-Control', 'no-store');

  return sendSuccess(res, 200, 'New password issued', {
    slip: {
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.studentProfile?.class?.name || null,
      admissionNumber: student.studentProfile?.admissionNumber,
      email: shownEmail(student.email),
      password,
    },
  });
};

module.exports = { issueLoginSlip };
