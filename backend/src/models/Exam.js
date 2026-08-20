const mongoose = require('mongoose');
const { EXAM_TYPES, GRADE_SCALE } = require('../config/constants');

// ─── EXAM SESSION MODEL ─────────────────────────────────────────────────────
const ExamSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Exam title is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(EXAM_TYPES),
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
    startDate: {
      type: Date,
      required: true,
    },
    endDate: Date,
    totalMarks: {
      type: Number,
      required: true,
      default: 100,
    },
    passMark: {
      type: Number,
      default: 40,
    },
    instructions: String,
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
  },
  {
    timestamps: true,
  },
);

ExamSchema.index({ class: 1, term: 1, academicYear: 1, type: 1 });

const Exam = mongoose.model('Exam', ExamSchema);

// ─── RESULT MODEL ─────────────────────────────────────────────────────────────
const ScoreBreakdownSchema = new mongoose.Schema(
  {
    ca1: { type: Number, default: 0, min: 0, max: 10 },
    ca2: { type: Number, default: 0, min: 0, max: 10 },
    midTerm: { type: Number, default: 0, min: 0, max: 10 },
    exam: { type: Number, default: 0, min: 0, max: 70 },
  },
  { _id: false },
);

const ResultSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
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
    scores: {
      type: ScoreBreakdownSchema,
      default: {},
    },
    totalScore: {
      type: Number,
      default: 0,
    },
    grade: {
      type: String,
      enum: ['A', 'B', 'C', 'D', 'E', 'F'],
    },
    remark: String,
    gradePoint: Number,
    classAverage: Number,
    classHighest: Number,
    classLowest: Number,
    position: Number,
    teacherComment: String,
    isPublished: { type: Boolean, default: false },
    gradedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Auto-calculate total score and grade
ResultSchema.pre('save', function (next) {
  if (this.isModified('scores')) {
    const { ca1, ca2, midTerm, exam } = this.scores;
    this.totalScore = (ca1 || 0) + (ca2 || 0) + (midTerm || 0) + (exam || 0);
    const grading = calculateGrade(this.totalScore);
    this.grade = grading.grade;
    this.remark = grading.remark;
    this.gradePoint = grading.gradePoint;
  }
  next();
});

/**
 * Resolve a score to its band on the school's grading scale.
 * Reads GRADE_SCALE in config/constants.js — there is no second ladder to keep
 * in sync when the school changes its boundaries.
 */
function calculateGrade(score) {
  const value = Number(score) || 0;

  const band =
    GRADE_SCALE.find((b) => value >= b.min && value <= b.max) ||
    GRADE_SCALE[GRADE_SCALE.length - 1]; // out of range scores fall to the lowest band

  return {
    grade: band.grade,
    remark: band.remark,
    gradePoint: band.gradePoint,
  };
}

ResultSchema.index({ student: 1, term: 1, academicYear: 1 });
ResultSchema.index(
  { student: 1, subject: 1, term: 1, academicYear: 1 },
  { unique: true },
);
ResultSchema.index({ class: 1, term: 1, academicYear: 1 });

const Result = mongoose.model('Result', ResultSchema);

module.exports = { Exam, Result, calculateGrade };
