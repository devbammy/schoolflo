const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  sendSuccess,
  sendError,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../services/fileService');

// GET all users (Admin)
// router.get('/', protect, authorize('Admin'), async (req, res) => {
//   try {
//     const { role, search, isActive } = req.query;
//     const { page, limit, skip } = getPaginationParams(req.query);

//     const filter = {};
//     if (role) filter.role = role;
//     if (isActive !== undefined) filter.isActive = isActive === 'true';

//     if (search) {
//       filter.$or = [
//         { firstName: new RegExp(search, 'i') },
//         { lastName: new RegExp(search, 'i') },
//         { email: new RegExp(search, 'i') },
//         { 'studentProfile.admissionNumber': new RegExp(search, 'i') },
//         { 'teacherProfile.staffId': new RegExp(search, 'i') },
//       ];
//     }

//     const [users, total] = await Promise.all([
//       User.find(filter)
//         .populate('studentProfile.class', 'name level')
//         .select('-password')
//         .sort({ createdAt: -1 })
//         .skip(skip)
//         .limit(limit),
//       User.countDocuments(filter),
//     ]);

//     return sendPaginated(res, users, total, page, limit);
//   } catch (error) {
//     return sendError(res, 500, error.message);
//   }
// });

router.get('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const { role, search, isActive, class: classId } = req.query;
    const { page, limit, skip } = getPaginationParams(req.query);

    const filter = {};

    if (role) filter.role = role;

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    // ADD THIS
    if (classId) {
      filter['studentProfile.class'] = classId;
    }

    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        {
          'studentProfile.admissionNumber': new RegExp(search, 'i'),
        },
        {
          'teacherProfile.staffId': new RegExp(search, 'i'),
        },
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
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// GET single user
router.get('/:id', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .populate('studentProfile.class', 'name level')
      .populate('teacherProfile.classTeacherOf', 'name')
      .populate('teacherProfile.subjectsTaught', 'name code')
      .select('-password');
    if (!user) return sendError(res, 404, 'User not found');
    return sendSuccess(res, 200, 'User fetched', { user });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// PUT update user
router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const { password, email, ...updateData } = req.body; // Prevent these from being updated here
    const user = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    }).select('-password');
    if (!user) return sendError(res, 404, 'User not found');
    return sendSuccess(res, 200, 'User updated', { user });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// PATCH toggle user active status
router.patch(
  '/:id/toggle-status',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) return sendError(res, 404, 'User not found');
      user.isActive = !user.isActive;
      await user.save({ validateBeforeSave: false });
      return sendSuccess(
        res,
        200,
        `User ${user.isActive ? 'activated' : 'deactivated'}`,
        { isActive: user.isActive },
      );
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// DELETE user
router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return sendError(res, 404, 'User not found');
    if (user.avatar?.publicId) await deleteFromCloudinary(user.avatar.publicId);
    await user.deleteOne();
    return sendSuccess(res, 200, 'User deleted');
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// POST upload avatar
router.post(
  '/:id/avatar',
  protect,
  upload.single('avatar'),
  async (req, res) => {
    try {
      if (String(req.user._id) !== req.params.id && req.user.role !== 'Admin') {
        return sendError(res, 403, 'You can only update your own avatar');
      }
      if (!req.file) return sendError(res, 400, 'No image uploaded');

      const user = await User.findById(req.params.id);
      if (user.avatar?.publicId)
        await deleteFromCloudinary(user.avatar.publicId, 'image');

      const result = await uploadToCloudinary(req.file.buffer, 'avatars', {
        transformation: [
          { width: 300, height: 300, crop: 'fill', gravity: 'face' },
        ],
      });

      user.avatar = { url: result.secure_url, publicId: result.public_id };
      await user.save({ validateBeforeSave: false });

      return sendSuccess(res, 200, 'Avatar updated', {
        avatarUrl: result.secure_url,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// GET students in a class

router.get(
  '/students/class/:classId',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const students = await User.find({
        role: 'Student',
        'studentProfile.class': req.params.classId,
        // Include students whose profileStatus is 'Active' OR not yet set
        // (findByIdAndUpdate does not apply Mongoose defaults, so the field
        //  may be missing on students created via update rather than create)
        'studentProfile.profileStatus': { $in: ['Active', null, undefined] },
      })
        .populate('studentProfile.class', 'name')
        .select('-password')
        .sort({ lastName: 1 });

      return sendSuccess(res, 200, 'Students fetched', {
        students,
        count: students.length,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

module.exports = router;
