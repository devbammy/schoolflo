const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const { Assignment } = require('../models/Assignment');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { upload, processUploadedFiles } = require('../services/fileService');

// GET ALL ASSIGNMENTS
router.get('/', protect, async (req, res) => {
  try {
    const {
      classId,
      subjectId,
      term,
      academicYear,
      status,
      page = 1,
      limit = 10,
      search,
    } = req.query;

    const filter = {
      isActive: true,
    };

    // Teacher sees only their assignments
    if (req.user.role === 'Teacher') {
      filter.teacher = req.user._id;
    }

    if (classId && mongoose.Types.ObjectId.isValid(classId)) {
      filter.class = classId;
    }

    if (subjectId && mongoose.Types.ObjectId.isValid(subjectId)) {
      filter.subject = subjectId;
    }

    if (term) {
      filter.term = term;
    }

    if (academicYear) {
      filter.academicYear = academicYear;
    }

    // Status filters
    if (status === 'published') {
      filter.isPublished = true;
    }

    if (status === 'draft') {
      filter.isPublished = false;
    }

    // Search
    if (search) {
      filter.$or = [
        {
          title: {
            $regex: search,
            $options: 'i',
          },
        },
        {
          description: {
            $regex: search,
            $options: 'i',
          },
        },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [assignments, total] = await Promise.all([
      Assignment.find(filter)
        .populate('class', 'name')
        .populate('subject', 'name code')
        .populate('teacher', 'firstName lastName')
        .sort({
          dueDate: 1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(Number(limit)),

      Assignment.countDocuments(filter),
    ]);

    return sendSuccess(res, 200, 'Assignments fetched successfully', {
      assignments,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// GET SINGLE ASSIGNMEN
router.get('/:id', protect, async (req, res) => {
  try {
    const assignment = await Assignment.findOne({
      _id: req.params.id,
      isActive: true,
    })
      .populate('class', 'name')
      .populate('subject', 'name code')
      .populate('teacher', 'firstName lastName email')
      .populate('submissionCount');

    if (!assignment) {
      return sendError(res, 404, 'Assignment not found');
    }

    return sendSuccess(res, 200, 'Assignment fetched successfully', {
      assignment,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
});

// CREATE ASSIGNMEN
router.post(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  upload.array('attachments', 5),
  async (req, res) => {
    try {
      const attachments = req.files?.length
        ? await processUploadedFiles(req.files, 'assignments')
        : [];

      // Prevent past due date
      if (req.body.dueDate && new Date(req.body.dueDate) < new Date()) {
        return sendError(res, 400, 'Due date cannot be in the past');
      }

      const assignment = await Assignment.create({
        title: req.body.title,
        description: req.body.description,
        instructions: req.body.instructions,
        class: req.body.class,
        subject: req.body.subject,
        term: req.body.term,
        academicYear: req.body.academicYear,
        dueDate: req.body.dueDate,
        totalMarks: req.body.totalMarks,
        allowLateSubmission: req.body.allowLateSubmission === 'true',
        isPublished: req.body.isPublished === 'true',
        teacher: req.user._id,
        attachments,
      });

      const populatedAssignment = await Assignment.findById(assignment._id)
        .populate('class', 'name')
        .populate('subject', 'name code')
        .populate('teacher', 'firstName lastName');

      return sendSuccess(res, 201, 'Assignment created successfully', {
        assignment: populatedAssignment,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// UPDATE ASSIGNMEN
router.put(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  upload.array('attachments', 5),
  async (req, res) => {
    try {
      const assignment = await Assignment.findById(req.params.id);

      if (!assignment || !assignment.isActive) {
        return sendError(res, 404, 'Assignment not found');
      }

      // Teachers can only edit their own assignments
      if (
        req.user.role === 'Teacher' &&
        assignment.teacher.toString() !== req.user._id.toString()
      ) {
        return sendError(res, 403, 'Unauthorized access');
      }

      let attachments = assignment.attachments;

      if (req.files?.length) {
        const uploadedFiles = await processUploadedFiles(
          req.files,
          'assignments',
        );

        attachments = [...attachments, ...uploadedFiles];
      }

      Object.assign(assignment, {
        title: req.body.title ?? assignment.title,

        description: req.body.description ?? assignment.description,

        instructions: req.body.instructions ?? assignment.instructions,

        class: req.body.class ?? assignment.class,

        subject: req.body.subject ?? assignment.subject,

        term: req.body.term ?? assignment.term,

        academicYear: req.body.academicYear ?? assignment.academicYear,

        dueDate: req.body.dueDate ?? assignment.dueDate,

        totalMarks: req.body.totalMarks ?? assignment.totalMarks,

        allowLateSubmission:
          req.body.allowLateSubmission !== undefined
            ? req.body.allowLateSubmission === 'true'
            : assignment.allowLateSubmission,

        isPublished:
          req.body.isPublished !== undefined
            ? req.body.isPublished === 'true'
            : assignment.isPublished,

        attachments,
      });

      await assignment.save();

      const updatedAssignment = await Assignment.findById(assignment._id)
        .populate('class', 'name')
        .populate('subject', 'name code')
        .populate('teacher', 'firstName lastName');

      return sendSuccess(res, 200, 'Assignment updated successfully', {
        assignment: updatedAssignment,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// PUBLISH ASSIGNMEN
router.patch(
  '/:id/publish',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const assignment = await Assignment.findById(req.params.id);

      if (!assignment || !assignment.isActive) {
        return sendError(res, 404, 'Assignment not found');
      }

      if (
        req.user.role === 'Teacher' &&
        assignment.teacher.toString() !== req.user._id.toString()
      ) {
        return sendError(res, 403, 'Unauthorized access');
      }

      assignment.isPublished = true;

      await assignment.save();

      return sendSuccess(res, 200, 'Assignment published successfully', {
        assignment,
      });
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

// DELETE ASSIGNMENT (SOFT DELETE
router.delete(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const assignment = await Assignment.findById(req.params.id);

      if (!assignment || !assignment.isActive) {
        return sendError(res, 404, 'Assignment not found');
      }

      // Teachers can only delete their own assignments
      if (
        req.user.role === 'Teacher' &&
        assignment.teacher.toString() !== req.user._id.toString()
      ) {
        return sendError(res, 403, 'Unauthorized access');
      }

      assignment.isActive = false;

      await assignment.save();

      return sendSuccess(res, 200, 'Assignment deleted successfully');
    } catch (error) {
      return sendError(res, 500, error.message);
    }
  },
);

module.exports = router;
