const mongoose = require('mongoose');
const { SUBMISSION_STATUS } = require('../config/constants');

// ─────────────────────────────────────────────────────────────
// Assignment Schema
// ─────────────────────────────────────────────────────────────

const attachmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
      required: true,
    },
    publicId: String,
    mimeType: String,
    size: Number,
  },
  { _id: false },
);

const AssignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Assignment title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },

    description: {
      type: String,
      required: [true, 'Description is required'],
      trim: true,
    },

    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: [true, 'Class is required'],
    },

    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject is required'],
    },

    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Teacher is required'],
    },

    term: {
      type: String,
      required: true,
      enum: ['First Term', 'Second Term', 'Third Term'],
    },

    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      match: [/^\d{4}\/\d{4}$/, 'Academic year must be like 2025/2026'],
    },

    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
      validate: {
        validator(value) {
          return value instanceof Date && !isNaN(value);
        },
        message: 'Invalid due date',
      },
    },

    totalMarks: {
      type: Number,
      required: [true, 'Total marks is required'],
      min: [1, 'Total marks must be at least 1'],
    },

    instructions: {
      type: String,
      trim: true,
    },

    attachments: [attachmentSchema],

    allowLateSubmission: {
      type: Boolean,
      default: false,
    },

    isPublished: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    publishedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─────────────────────────────────────────────────────────────
// Virtuals
// ─────────────────────────────────────────────────────────────

AssignmentSchema.virtual('isOverdue').get(function () {
  return this.isActive && new Date() > this.dueDate;
});

AssignmentSchema.virtual('canSubmit').get(function () {
  if (!this.isActive || !this.isPublished) {
    return false;
  }

  if (new Date() <= this.dueDate) {
    return true;
  }

  return this.allowLateSubmission;
});

AssignmentSchema.virtual('submissionCount', {
  ref: 'Submission',
  localField: '_id',
  foreignField: 'assignment',
  count: true,
});

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────

AssignmentSchema.pre('save', function (next) {
  if (this.isPublished && !this.publishedAt) {
    this.publishedAt = new Date();
  }

  next();
});

// ─────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────

AssignmentSchema.index({
  class: 1,
  subject: 1,
  term: 1,
  academicYear: 1,
});

AssignmentSchema.index({
  teacher: 1,
  createdAt: -1,
});

AssignmentSchema.index({
  dueDate: 1,
});

const Assignment = mongoose.model('Assignment', AssignmentSchema);

// ─────────────────────────────────────────────────────────────
// Submission Schema
// ─────────────────────────────────────────────────────────────

const SubmissionSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment',
      required: [true, 'Assignment is required'],
    },

    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Student is required'],
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    isLate: {
      type: Boolean,
      default: false,
    },

    files: [attachmentSchema],

    comment: {
      type: String,
      trim: true,
    },

    status: {
      type: String,
      enum: Object.values(SUBMISSION_STATUS),
      default: SUBMISSION_STATUS.SUBMITTED,
    },

    score: {
      type: Number,
      min: [0, 'Score cannot be negative'],
    },

    feedback: {
      type: String,
      trim: true,
    },

    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    gradedAt: Date,
  },
  {
    timestamps: true,
  },
);

// ─────────────────────────────────────────────────────────────
// Middleware
// ─────────────────────────────────────────────────────────────

SubmissionSchema.pre('save', async function (next) {
  try {
    const assignment = await mongoose
      .model('Assignment')
      .findById(this.assignment);

    if (!assignment) {
      return next(new Error('Assignment not found'));
    }

    // Determine late submission
    this.isLate = new Date() > assignment.dueDate;

    // Prevent late submission if disabled
    if (this.isLate && !assignment.allowLateSubmission) {
      return next(new Error('Late submission is not allowed'));
    }

    // Validate score
    if (this.score !== undefined && this.score > assignment.totalMarks) {
      return next(new Error(`Score cannot exceed ${assignment.totalMarks}`));
    }

    // Auto grading timestamp
    if (this.isModified('score') || this.isModified('feedback')) {
      this.gradedAt = new Date();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ─────────────────────────────────────────────────────────────
// Indexes
// ─────────────────────────────────────────────────────────────

// Prevent duplicate submissions
SubmissionSchema.index(
  {
    assignment: 1,
    student: 1,
  },
  {
    unique: true,
  },
);

SubmissionSchema.index({
  student: 1,
  status: 1,
});

SubmissionSchema.index({
  assignment: 1,
  submittedAt: -1,
});

const Submission = mongoose.model('Submission', SubmissionSchema);

module.exports = {
  Assignment,
  Submission,
};
