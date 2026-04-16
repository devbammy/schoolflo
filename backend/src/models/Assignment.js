const mongoose = require('mongoose');
const { SUBMISSION_STATUS } = require('../config/constants');

// ─── ASSIGNMENT MODEL ─────────────────────────────────────────────────────────
const AssignmentSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Assignment title is required'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
  },
  class: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Class',
    required: true,
  },
  subject: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subject',
    required: true,
  },
  teacher: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  term: {
    type: String,
    required: true,
    enum: ['First Term', 'Second Term', 'Third Term'],
  },
  academicYear: {
    type: String,
    required: true,
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required'],
  },
  totalMarks: {
    type: Number,
    required: true,
    min: 1,
  },
  attachments: [{
    name: String,
    url: String,
    publicId: String,
    mimeType: String,
    size: Number,
  }],
  isActive: { type: Boolean, default: true },
  allowLateSubmission: { type: Boolean, default: false },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

AssignmentSchema.virtual('isOverdue').get(function () {
  return new Date() > this.dueDate;
});

AssignmentSchema.index({ class: 1, subject: 1, term: 1 });
AssignmentSchema.index({ teacher: 1 });

const Assignment = mongoose.model('Assignment', AssignmentSchema);

// ─── SUBMISSION MODEL ─────────────────────────────────────────────────────────
const SubmissionSchema = new mongoose.Schema({
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true,
  },
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  isLate: {
    type: Boolean,
    default: false,
  },
  files: [{
    name: String,
    url: String,
    publicId: String,
    mimeType: String,
    size: Number,
  }],
  comment: String,
  status: {
    type: String,
    enum: Object.values(SUBMISSION_STATUS),
    default: SUBMISSION_STATUS.SUBMITTED,
  },
  // Grading
  score: {
    type: Number,
    min: 0,
  },
  feedback: String,
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  gradedAt: Date,
}, {
  timestamps: true,
});

// Prevent duplicate submissions
SubmissionSchema.index({ assignment: 1, student: 1 }, { unique: true });

const Submission = mongoose.model('Submission', SubmissionSchema);

module.exports = { Assignment, Submission };
