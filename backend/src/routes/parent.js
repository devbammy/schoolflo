const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  sendSuccess,
  sendError,
  getPaginationParams,
  sendPaginated,
} = require('../utils/apiResponse');
const {
  sendEmail,
  emailTemplates,
} = require('../services/notificationService');

// GET all parents (with their linked children)
router.get('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const { search, page = 1, limit = 15 } = req.query;
    const { skip } = { skip: (page - 1) * limit };

    const filter = { role: 'Parent' };
    if (search) {
      filter.$or = [
        { firstName: new RegExp(search, 'i') },
        { lastName: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { phone: new RegExp(search, 'i') },
      ];
    }

    const [parents, total] = await Promise.all([
      User.find(filter)
        .populate({
          path: 'parentProfile.children',
          select: 'firstName lastName studentProfile avatar',
          populate: { path: 'studentProfile.class', select: 'name level' },
        })
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(filter),
    ]);

    return sendPaginated(res, parents, total, page, limit);
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// POST create parent account
router.post('/', protect, authorize('Admin'), async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      phone,
      parentProfile,
      childrenIds = [],
    } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return sendError(res, 400, 'Email already registered');

    const parent = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      role: 'Parent',
      parentProfile: {
        occupation: parentProfile?.occupation || '',
        relationship: parentProfile?.relationship || 'Guardian',
        children: childrenIds,
      },
    });

    // Link parent to each child's studentProfile.parentId
    if (childrenIds.length) {
      await User.updateMany(
        { _id: { $in: childrenIds } },
        { $set: { 'studentProfile.parentId': parent._id } },
      );
    }

    // Send welcome email
    await sendEmail({
      to: email,
      subject: 'Welcome to School Management Portal',
      html: emailTemplates.welcome({
        firstName,
        email,
        password,
        role: 'Parent',
        loginUrl: `${process.env.CLIENT_URL}/login`,
      }),
    });

    await parent.populate({
      path: 'parentProfile.children',
      select: 'firstName lastName studentProfile',
    });

    parent.password = undefined;
    return sendSuccess(res, 201, 'Parent account created', { parent });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// PUT update parent profile
router.put('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const { password, email, ...updateData } = req.body;
    const parent = await User.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate({
        path: 'parentProfile.children',
        select: 'firstName lastName studentProfile avatar',
      })
      .select('-password');

    if (!parent) return sendError(res, 404, 'Parent not found');
    return sendSuccess(res, 200, 'Parent updated', { parent });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// PATCH link/unlink children
// Body: { action: 'link' | 'unlink', childId: string }
router.patch('/:id/children', protect, authorize('Admin'), async (req, res) => {
  try {
    const { action, childId } = req.body;

    const parent = await User.findById(req.params.id);
    if (!parent || parent.role !== 'Parent')
      return sendError(res, 404, 'Parent not found');

    const child = await User.findById(childId);
    if (!child || child.role !== 'Student')
      return sendError(res, 404, 'Student not found');

    if (action === 'link') {
      // Add child to parent's list (if not already)
      if (!parent.parentProfile.children.includes(childId)) {
        parent.parentProfile.children.push(childId);
      }
      // Set parentId on child
      child.studentProfile.parentId = parent._id;
      await child.save({ validateBeforeSave: false });
    } else if (action === 'unlink') {
      parent.parentProfile.children = parent.parentProfile.children.filter(
        (id) => String(id) !== String(childId),
      );
      // Remove parentId from child
      if (String(child.studentProfile.parentId) === String(parent._id)) {
        child.studentProfile.parentId = undefined;
        await child.save({ validateBeforeSave: false });
      }
    } else {
      return sendError(res, 400, 'Action must be "link" or "unlink"');
    }

    await parent.save({ validateBeforeSave: false });
    await parent.populate({
      path: 'parentProfile.children',
      select: 'firstName lastName studentProfile avatar',
    });

    return sendSuccess(res, 200, `Child ${action}ed successfully`, {
      children: parent.parentProfile.children,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// DELETE parent
router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const parent = await User.findById(req.params.id);
    if (!parent) return sendError(res, 404, 'Parent not found');

    // Remove parentId from all their children
    await User.updateMany(
      { 'studentProfile.parentId': parent._id },
      { $unset: { 'studentProfile.parentId': '' } },
    );

    await parent.deleteOne();
    return sendSuccess(res, 200, 'Parent account deleted');
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// GET unlinked students (students without a parent)
router.get(
  '/students/unlinked',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const { search } = req.query;
      const filter = {
        role: 'Student',
        $or: [
          { 'studentProfile.parentId': { $exists: false } },
          { 'studentProfile.parentId': null },
        ],
      };
      if (search) {
        filter.$and = [
          {
            $or: [
              { firstName: new RegExp(search, 'i') },
              { lastName: new RegExp(search, 'i') },
              { 'studentProfile.admissionNumber': new RegExp(search, 'i') },
            ],
          },
        ];
      }

      const students = await User.find(filter)
        .populate('studentProfile.class', 'name')
        .select('firstName lastName studentProfile avatar')
        .limit(50);

      return sendSuccess(res, 200, 'Unlinked students', { students });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// GET children's assignments and submissions for parent
router.get(
  '/children/assignments',
  protect,
  authorize('Parent'),
  async (req, res) => {
    try {
      const parent = await User.findById(req.user._id).populate(
        'parentProfile.children',
      );

      if (!parent || !parent.parentProfile.children.length) {
        return sendSuccess(res, 200, 'No children found', { assignments: [] });
      }

      const { Assignment } = require('../models/Assignment');
      const { Submission } = require('../models/Assignment');

      const childrenIds = parent.parentProfile.children.map(
        (child) => child._id,
      );

      // Get all assignments for classes where children are enrolled
      const childClasses = parent.parentProfile.children
        .map((child) => child.studentProfile?.class)
        .filter(Boolean);

      const assignments = await Assignment.find({
        class: { $in: childClasses },
        isActive: true,
      })
        .populate('class', 'name')
        .populate('subject', 'name code')
        .populate('teacher', 'firstName lastName')
        .sort({ dueDate: -1 });

      // Get all submissions for these children
      const submissions = await Submission.find({
        student: { $in: childrenIds },
      })
        .populate('student', 'firstName lastName')
        .lean();

      // Combine data: for each assignment, show submission status for each child
      const assignmentData = assignments.map((assignment) => {
        const childSubmissions = {};
        parent.parentProfile.children.forEach((child) => {
          const submission = submissions.find(
            (sub) =>
              String(sub.assignment) === String(assignment._id) &&
              String(sub.student._id) === String(child._id),
          );
          childSubmissions[String(child._id)] = {
            childName: `${child.firstName} ${child.lastName}`,
            status: submission?.status || 'Not Submitted',
            submittedAt: submission?.submittedAt || null,
            isLate: submission?.isLate || false,
            score: submission?.score || null,
            feedback: submission?.feedback || null,
          };
        });

        return {
          _id: assignment._id,
          title: assignment.title,
          description: assignment.description,
          subject: assignment.subject,
          class: assignment.class,
          dueDate: assignment.dueDate,
          totalMarks: assignment.totalMarks,
          isOverdue: new Date() > assignment.dueDate,
          childrenData: childSubmissions,
        };
      });

      return sendSuccess(res, 200, 'Children assignments retrieved', {
        assignments: assignmentData,
        children: parent.parentProfile.children.map((child) => ({
          _id: child._id,
          name: `${child.firstName} ${child.lastName}`,
          class: child.studentProfile?.class?.name,
        })),
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

module.exports = router;
