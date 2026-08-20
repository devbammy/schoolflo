const User = require('../models/User');
const Session = require('../models/Session');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../services/fileService');

// Regex metacharacters in a search box would otherwise be interpreted, letting
// a user craft a pattern that scans the whole collection.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// @desc    List users, filtered and paginated
// @route   GET /api/v1/users
// @access  Admin
const getUsers = async (req, res) => {
  const { role, search, isActive, class: classId } = req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (classId) filter['studentProfile.class'] = classId;

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { 'studentProfile.admissionNumber': pattern },
      { 'teacherProfile.staffId': pattern },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .populate('studentProfile.class', 'name level')
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return sendPaginated(res, users, total, page, limit);
};

// @desc    Get one user
// @route   GET /api/v1/users/:id
// @access  Admin, Teacher
const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('studentProfile.class', 'name level')
    .populate('teacherProfile.classTeacherOf', 'name')
    .populate('teacherProfile.subjectsTaught', 'name code')
    .select('-password');

  if (!user) throw AppError.notFound('User not found');

  return sendSuccess(res, 200, 'User fetched', { user });
};

// @desc    Update a user's profile
// @route   PUT /api/v1/users/:id
// @access  Admin
const updateUser = async (req, res) => {
  // password, email and role are stripped: each has its own dedicated flow and
  // must not be mass-assignable from a profile edit.
  const { password, email, role, ...updateData } = req.body;

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  }).select('-password');

  if (!user) throw AppError.notFound('User not found');

  return sendSuccess(res, 200, 'User updated', { user });
};

// @desc    Activate / deactivate a user
// @route   PATCH /api/v1/users/:id/toggle-status
// @access  Admin
const toggleUserStatus = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  // Deactivating must also cut off existing sessions, otherwise the account
  // keeps working until its refresh token happens to expire.
  if (!user.isActive) {
    await Session.deleteMany({ user: user._id });
  }

  return sendSuccess(
    res,
    200,
    `User ${user.isActive ? 'activated' : 'deactivated'}`,
    { isActive: user.isActive },
  );
};

// @desc    Delete a user
// @route   DELETE /api/v1/users/:id
// @access  Admin
const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  if (String(user._id) === String(req.user._id)) {
    throw AppError.badRequest('You cannot delete your own account.');
  }

  if (user.avatar?.publicId) {
    await deleteFromCloudinary(user.avatar.publicId, 'image');
  }

  await Session.deleteMany({ user: user._id });
  await user.deleteOne();

  return sendSuccess(res, 200, 'User deleted');
};

// @desc    Upload or replace a user's avatar
// @route   POST /api/v1/users/:id/avatar
// @access  Admin, or the user themselves
const uploadUserAvatar = async (req, res) => {
  if (String(req.user._id) !== req.params.id && req.user.role !== 'Admin') {
    throw AppError.forbidden('You can only update your own avatar');
  }

  if (!req.file) throw AppError.badRequest('No image uploaded');

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  if (user.avatar?.publicId) {
    await deleteFromCloudinary(user.avatar.publicId, 'image');
  }

  const result = await uploadToCloudinary(req.file.buffer, 'avatars', {
    transformation: [{ width: 300, height: 300, crop: 'fill', gravity: 'face' }],
  });

  user.avatar = { url: result.secure_url, publicId: result.public_id };
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, 200, 'Avatar updated', {
    avatarUrl: result.secure_url,
  });
};

// @desc    Active students in a class
// @route   GET /api/v1/users/students/class/:classId
// @access  Admin, Teacher
const getStudentsInClass = async (req, res) => {
  const students = await User.find({
    role: 'Student',
    'studentProfile.class': req.params.classId,
    // Include students whose profileStatus is 'Active' OR not yet set —
    // findByIdAndUpdate does not apply schema defaults, so the field may be
    // missing on students created via an update rather than a create.
    'studentProfile.profileStatus': { $in: ['Active', null, undefined] },
  })
    .populate('studentProfile.class', 'name')
    .select('-password')
    .sort({ lastName: 1 });

  return sendSuccess(res, 200, 'Students fetched', {
    students,
    count: students.length,
  });
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  toggleUserStatus,
  deleteUser,
  uploadUserAvatar,
  getStudentsInClass,
};
