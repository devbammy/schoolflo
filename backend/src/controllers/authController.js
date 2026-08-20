const crypto = require('crypto');
const User = require('../models/User');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const {
  sendEmail,
  emailTemplates,
} = require('../services/notificationService');

// @desc    Register user (Admin only in prod)
// @route   POST /api/v1/auth/register
// @access  Private (Admin)

const register = async (req, res) => {
  try {
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

    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, 400, 'Email already registered');

    // Helper to convert empty strings to null for ObjectId fields
    const cleanObjectId = (val) => (val === '' || !val ? null : val);

    const user = await User.create({
      firstName,
      lastName,
      email,
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

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Welcome email carrying the credentials the admin just set. Sent before
    // `password` is cleared below, and never allowed to fail the registration —
    // the account exists either way.
    sendEmail({
      to: user.email,
      subject: 'Your account is ready',
      html: emailTemplates.welcome({
        firstName: user.firstName,
        email: user.email,
        password,
        role: user.role,
        loginUrl: `${process.env.CLIENT_URL}/login`,
      }),
    }).catch((err) =>
      console.error(`Welcome email failed for ${user.email}: ${err.message}`),
    );

    user.password = undefined;

    return sendSuccess(res, 201, 'User registered successfully', {
      user,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Login
// @route   POST /api/v1/auth/login
// @access  Public

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return sendError(res, 400, 'Email and password are required');
    }

    // 🔐 Get user with password
    const user = await User.findOne({ email }).select('+password');
    if (!user) return sendError(res, 401, 'Invalid credentials');

    if (!user.isActive) {
      return sendError(res, 401, 'Account deactivated. Contact admin.');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return sendError(res, 401, 'Invalid credentials');

    // 🕒 Update last login
    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    // 🔑 Tokens
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

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

    return sendSuccess(res, 200, 'Login successful', {
      user: populatedUser,
      accessToken,
      refreshToken,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Get current user profile
// @route   GET /api/v1/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
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
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Update password
// @route   PUT /api/v1/auth/update-password
// @access  Private
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) return sendError(res, 401, 'Current password is incorrect');

    user.password = newPassword;
    await user.save();

    const accessToken = user.generateAccessToken();
    return sendSuccess(res, 200, 'Password updated successfully', {
      accessToken,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
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

  try {
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

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    const { success } = await sendEmail({
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
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Reset password
// @route   PUT /api/v1/auth/reset-password/:token
// @access  Public
const resetPassword = async (req, res) => {
  try {
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

    const accessToken = user.generateAccessToken();
    return sendSuccess(res, 200, 'Password reset successful', { accessToken });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public
const refreshToken = async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const { refreshToken: token } = req.body;
    if (!token) return sendError(res, 401, 'Refresh token required');

    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive)
      return sendError(res, 401, 'User not found or inactive');

    const accessToken = user.generateAccessToken();
    return sendSuccess(res, 200, 'Token refreshed', { accessToken });
  } catch (error) {
    return sendError(res, 401, 'Invalid refresh token');
  }
};

module.exports = {
  register,
  login,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword,
  refreshToken,
};
