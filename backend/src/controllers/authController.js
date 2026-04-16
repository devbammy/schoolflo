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
    const { firstName, lastName, email, password, role, phone } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, 400, 'Email already registered');

    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      role,
      phone,
      studentProfile: role === 'student' ? {} : undefined,
    });

    console.log(user.studentProfile);

    // Send welcome email
    await sendEmail({
      to: email,
      subject: 'Welcome to School Management Portal',
      html: emailTemplates.welcome({
        firstName,
        email,
        password,
        role,
        loginUrl: `${process.env.CLIENT_URL}/login`,
      }),
    });

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

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

    if (!email || !password)
      return sendError(res, 400, 'Email and password are required');

    const user = await User.findOne({ email }).select('+password');
    if (!user) return sendError(res, 401, 'Invalid credentials');

    if (!user.isActive)
      return sendError(res, 401, 'Account deactivated. Contact admin.');

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return sendError(res, 401, 'Invalid credentials');

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.password = undefined;
    return sendSuccess(res, 200, 'Login successful', {
      user: {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
        avatar: user.avatar,
        lastLogin: user.lastLogin,
        studentProfile: user.studentProfile,
        teacherProfile: user.teacherProfile,
        parentProfile: user.parentProfile,
      },
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
      .populate(
        'parentProfile.children',
        'firstName lastName studentProfile.admissionNumber',
      );

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

// @desc    Forgot password (send reset email)
// @route   POST /api/v1/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user) return sendError(res, 404, 'No user with that email address');

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    user.passwordResetExpire = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Password Reset Request',
      html: `<p>Click <a href="${resetUrl}">here</a> to reset your password. This link expires in 10 minutes.</p>`,
    });

    return sendSuccess(res, 200, 'Password reset email sent');
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
