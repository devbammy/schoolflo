const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const ms = require('../utils/ms');
const User = require('../models/User');
const Session = require('../models/Session');
const { clientUrl } = require('../config/clientUrl');
const AppError = require('../utils/AppError');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { emailTemplates } = require('../services/notificationService');
const { enqueueEmail } = require('../services/jobQueue');
const audit = require('../services/auditService');
const { hasMailbox } = require('../utils/mailbox');
const {
  isEmailIdentifier,
  normalizeAdmissionNumber,
  normalizeEmailIdentifier,
  rawLoginIdentifier,
} = require('../utils/loginIdentifier');

// What the audit log calls an account. A student with no email is known by
// their admission number, not by an address nobody can read.
const accountLabel = (user) =>
  hasMailbox(user.email)
    ? user.email
    : user.studentProfile?.admissionNumber || String(user._id);

/**
 * Record a refresh token as a live session so it can later be revoked.
 */
const createSession = async (user, token, req) => {
  await Session.create({
    user: user._id,
    tokenHash: Session.hashToken(token),
    userAgent: req.get('user-agent')?.slice(0, 300),
    ip: req.ip,
    expiresAt: new Date(
      Date.now() + ms(process.env.JWT_REFRESH_EXPIRE || '30d'),
    ),
  });
};

// @desc    Register user (Admin only in prod)
// @route   POST /api/v1/auth/register
// @access  Private (Admin)

const register = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    role,
    phone,
    studentProfile,
    teacherProfile,
    parentProfile,
  } = req.body;

  // A student created with no email gets a placeholder address in the model.
  if (email) {
    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, 400, 'Email already registered');
  }

  // Helper to convert empty strings to null for ObjectId fields
  const cleanObjectId = (val) => (val === '' || !val ? null : val);

  const user = await User.create({
    firstName,
    lastName,
    email: email || undefined,
    password,
    role,
    phone,

    // ✅ FIXED ROLE CHECK (IMPORTANT)
    studentProfile:
      role === 'Student'
        ? {
            class: cleanObjectId(studentProfile?.class),
            section: studentProfile?.section || null,
            dateOfBirth: studentProfile?.dateOfBirth || null,
            gender: studentProfile?.gender || null,
            address: studentProfile?.address || null,
            bloodGroup: studentProfile?.bloodGroup || null,
            medicalNotes: studentProfile?.medicalNotes || null,
            profileStatus: 'Active',
          }
        : undefined,
    teacherProfile:
      role === 'Teacher'
        ? {
            ...teacherProfile,
            classTeacherOf: cleanObjectId(teacherProfile?.classTeacherOf),
          }
        : undefined,
    parentProfile: role === 'Parent' ? parentProfile : undefined,
  });

  // No tokens and no session. The caller is an admin creating someone else's
  // account, so tokens here gave the admin a live, unaudited sign-in as that
  // person, and left a session row for a device the user never used.

  // Welcome email carrying the credentials the admin just set. Sent before
  // `password` is cleared below, and never allowed to fail the registration —
  // the account exists either way. A student with no mailbox has none sent;
  // the admin chose the password and hands it over on a login slip.
  const emailed = hasMailbox(user.email);
  if (emailed) {
    enqueueEmail({
      to: user.email,
      subject: 'Your account is ready',
      html: emailTemplates.welcome({
        firstName: user.firstName,
        email: user.email,
        password,
        role: user.role,
        loginUrl: `${clientUrl()}/login`,
      }),
    }).catch((err) =>
      console.error(`Welcome email failed for ${user.email}: ${err.message}`),
    );
  }

  user.password = undefined;

  await audit.record(req, {
    action: 'user.create',
    entity: 'User',
    entityId: user._id,
    entityLabel: `${user.firstName} ${user.lastName}`,
    subject: user.role === 'Student' ? user._id : undefined,
    meta: {
      email: emailed ? user.email : undefined,
      role: user.role,
      admissionNumber: user.studentProfile?.admissionNumber,
      staffId: user.teacherProfile?.staffId,
    },
  });

  return sendSuccess(res, 201, 'User registered successfully', { user });
};

// @desc    Login
// @route   POST /api/v1/auth/login
// @access  Public

const login = async (req, res) => {
  // loginRules normalises this already. Done again here (it is idempotent) so
  // the lookup never depends on a validator having run: a client sending the
  // older `email` field, or a route mounted without the rules, still works.
  const { password } = req.body;
  const typed = String(rawLoginIdentifier(req.body) || '').trim();
  const identifier = isEmailIdentifier(typed)
    ? normalizeEmailIdentifier(typed)
    : normalizeAdmissionNumber(typed);

  if (!identifier || !password) {
    return sendError(
      res,
      400,
      'Email or admission number, and password, are required',
    );
  }

  // An admission number only ever names a student. Staff and parents sign in
  // with their email, which is also where a forgotten password goes.
  const query = isEmailIdentifier(identifier)
    ? { email: identifier }
    : { role: 'Student', 'studentProfile.admissionNumber': identifier };

  // 🔐 Get user with password
  const user = await User.findOne(query).select('+password');
  if (!user) return sendError(res, 401, 'Invalid credentials');

  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    await audit.recordAnonymous(req, {
      action: 'auth.login',
      entity: 'User',
      entityId: user._id,
      entityLabel: accountLabel(user),
      outcome: 'failure',
      reason: 'Incorrect password',
    });
    return sendError(res, 401, 'Invalid credentials');
  }

  // Checked after the password. Answering first told anyone who typed an address
  // that it belonged to a deactivated account, which this endpoint otherwise
  // refuses to reveal.
  if (!user.isActive) {
    return sendError(res, 401, 'Account deactivated. Contact admin.');
  }

  // 🕒 Update last login
  user.lastLogin = new Date();
  await user.save({ validateBeforeSave: false });

  // 🔑 Tokens
  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  await createSession(user, refreshToken, req);

  // ✅ IMPORTANT: fetch fully populated user
  const populatedUser = await User.findById(user._id)
    .populate('studentProfile.class', 'name level')
    .populate('teacherProfile.classTeacherOf', 'name')
    .populate('teacherProfile.subjectsTaught', 'name code')
    .populate({
      path: 'parentProfile.children',
      select: 'firstName lastName avatar studentProfile',
      populate: {
        path: 'studentProfile.class',
        select: 'name level',
      },
    });

  // Attach the user to the request rather than spreading it into a new object:
  // `ip` and `get()` live on Express's prototype and would be lost by a spread,
  // silently dropping the origin of every successful login.
  req.user = user;

  await audit.record(req, {
    action: 'auth.login',
    entity: 'User',
    entityId: user._id,
    entityLabel: accountLabel(user),
  });

  return sendSuccess(res, 200, 'Login successful', {
    user: populatedUser,
    accessToken,
    refreshToken,
  });
};

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = async (req, res) => {
  const user = await User.findById(req.user._id)
    .populate('studentProfile.class', 'name level')
    .populate('teacherProfile.classTeacherOf', 'name')
    .populate('teacherProfile.subjectsTaught', 'name code')
    .populate({
      path: 'parentProfile.children',
      select: 'firstName lastName avatar studentProfile',
      populate: {
        path: 'studentProfile.class',
        select: 'name level',
      },
    });

  return sendSuccess(res, 200, 'Profile fetched', { user });
};

// @desc    Update password
// @route   PUT /api/v1/auth/update-password
// @access  Private
const updatePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select('+password');

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) return sendError(res, 401, 'Current password is incorrect');

  user.password = newPassword;
  await user.save();

  // A password change already makes every older refresh token fail, but it
  // does so lazily and leaves dead session rows behind. End them now, and give
  // this device a session of its own — otherwise the person who just changed
  // their password is signed out as soon as their access token expires.
  await Session.deleteMany({ user: user._id });

  const accessToken = user.generateAccessToken();
  const refreshToken = user.generateRefreshToken();
  await createSession(user, refreshToken, req);

  await audit.record(req, {
    action: 'auth.password_change',
    entity: 'User',
    entityId: user._id,
    entityLabel: accountLabel(user),
  });

  return sendSuccess(res, 200, 'Password updated successfully', {
    accessToken,
    refreshToken,
  });
};

const RESET_TOKEN_TTL_MINUTES = 10;

// @desc    Forgot password (send reset email)
// @route   POST /api/v1/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  // Always the same answer, whether or not the address is on file — a
  // different response for unknown emails turns this public endpoint into a
  // way to enumerate the school's accounts.
  const genericMessage =
    'If an account exists for that email address, a password reset link has been sent.';

  const { email } = req.body;
  if (!email) return sendError(res, 400, 'Email is required');

  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !user.isActive) {
    return sendSuccess(res, 200, genericMessage);
  }

  const resetToken = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  user.passwordResetExpire = Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000;
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${clientUrl()}/reset-password/${resetToken}`;

  const { success } = await enqueueEmail({
    to: user.email,
    subject: 'Reset your password',
    html: emailTemplates.passwordReset({
      firstName: user.firstName,
      resetUrl,
      expiryMinutes: RESET_TOKEN_TTL_MINUTES,
    }),
  });

  if (!success) {
    // Don't leave a live token behind that its owner never received.
    user.passwordResetToken = undefined;
    user.passwordResetExpire = undefined;
    await user.save({ validateBeforeSave: false });
    return sendError(
      res,
      502,
      'Could not send the reset email. Please try again shortly.',
    );
  }

  return sendSuccess(res, 200, genericMessage);
};

// @desc    Reset password
// @route   PUT /api/v1/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpire: { $gt: Date.now() },
  });

  if (!user) return sendError(res, 400, 'Invalid or expired reset token');

  user.password = req.body.password;
  user.passwordResetToken = undefined;
  user.passwordResetExpire = undefined;
  await user.save();

  await audit.recordAnonymous(req, {
    action: 'auth.password_reset',
    entity: 'User',
    entityId: user._id,
    entityLabel: accountLabel(user),
  });

  const accessToken = user.generateAccessToken();
  return sendSuccess(res, 200, 'Password reset successful', { accessToken });
};

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  const { refreshToken: token } = req.body;

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
  } catch {
    throw AppError.unauthorized('Invalid or expired refresh token');
  }

  const presented = Session.hashToken(token);

  // A structurally valid token is not enough — it must still correspond to a
  // live session. This is what makes logout actually revoke access.
  let session = await Session.findOne({
    tokenHash: presented,
    user: decoded.id,
  });

  // Not the current token. It may still be the one this session just rotated
  // away from, which is either a harmless race or a leak, depending on when.
  let rotationRace = false;
  if (!session) {
    const retired = await Session.findOne({
      previousTokenHash: presented,
      user: decoded.id,
    });

    if (retired) {
      const age = Date.now() - (retired.rotatedAt?.getTime() ?? 0);

      if (age > Session.ROTATION_GRACE_MS) {
        // A token that was rotated away and is being presented again well
        // after the fact is a replay: whoever holds it is not the client that
        // rotated it. Revoke the session rather than serve either party.
        await retired.deleteOne();
        await audit.record(req, {
          action: 'auth.refresh_reuse',
          entity: 'User',
          entityId: decoded.id,
          subject: decoded.id,
          outcome: 'failure',
          reason: 'Refresh token reused after rotation',
          meta: { rotatedAt: retired.rotatedAt, sessionsEnded: 1 },
        });
        throw AppError.unauthorized(
          'This session has ended. Please log in again.',
        );
      }

      // Inside the grace window: a tab that raced the rotation, or a retry of
      // a response that never arrived. Serve it without rotating again.
      session = retired;
      rotationRace = true;
    }
  }

  if (!session) {
    throw AppError.unauthorized('This session has ended. Please log in again.');
  }

  const user = await User.findById(decoded.id);
  if (!user || !user.isActive) {
    await session.deleteOne();
    throw AppError.unauthorized('User not found or inactive');
  }

  // A password change invalidates every token issued before it.
  if (user.changedPasswordAfter(decoded.iat)) {
    await session.deleteOne();
    throw AppError.unauthorized('Password was changed. Please log in again.');
  }

  const accessToken = user.generateAccessToken();

  if (rotationRace) {
    // The caller is behind by one rotation. Hand back the token this session
    // currently holds so it catches up, and leave the rotation state alone —
    // rotating here would retire a token the winning caller is still using.
    await Session.updateOne(
      { _id: session._id },
      { $set: { lastUsedAt: new Date() } },
    );
    return sendSuccess(res, 200, 'Token refreshed', { accessToken });
  }

  const nextToken = user.generateRefreshToken();

  // Swap atomically against the hash we matched on. If two requests get this
  // far at once only one can win — the loser's update matches nothing, and it
  // falls into the grace path above on retry instead of minting a second
  // token against the same session.
  const rotated = await Session.findOneAndUpdate(
    { _id: session._id, tokenHash: presented },
    {
      $set: {
        tokenHash: Session.hashToken(nextToken),
        previousTokenHash: presented,
        rotatedAt: new Date(),
        lastUsedAt: new Date(),
        userAgent: req.get('user-agent')?.slice(0, 300),
        ip: req.ip,
      },
    },
    { new: true },
  );

  if (!rotated) {
    throw AppError.unauthorized('This session has ended. Please log in again.');
  }

  // The rotated token deliberately inherits the original `expiresAt`. A
  // sliding expiry would mean a session in daily use never ends, which is the
  // opposite of what a 30-day limit is for.
  return sendSuccess(res, 200, 'Token refreshed', {
    accessToken,
    refreshToken: nextToken,
  });
};

// @desc    Log out of this device
// @route   POST /api/v1/auth/logout
// @access  Private
const logout = async (req, res) => {
  const { refreshToken: token } = req.body;

  if (token) {
    await Session.deleteOne({
      tokenHash: Session.hashToken(token),
      user: req.user._id,
    });
  }

  return sendSuccess(res, 200, 'Logged out');
};

// @desc    Log out of every device
// @route   POST /api/v1/auth/logout-all
// @access  Private
const logoutAll = async (req, res) => {
  const { deletedCount } = await Session.deleteMany({ user: req.user._id });

  await audit.record(req, {
    action: 'auth.logout_all',
    entity: 'User',
    entityId: req.user._id,
    meta: { sessionsEnded: deletedCount },
  });

  return sendSuccess(res, 200, 'Logged out of all devices', {
    sessionsEnded: deletedCount,
  });
};

module.exports = {
  register,
  login,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword,
  logout,
  logoutAll,
  refreshToken,
};
