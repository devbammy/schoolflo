const mongoose = require('mongoose');
const {
  EXAM_TYPES,
  GRADE_SCALE,
  SCORE_BREAKDOWN,
} = require('../config/constants');

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
    ca1: { type: Number, default: 0, min: 0, max: SCORE_BREAKDOWN.CA1_MAX },
    ca2: { type: Number, default: 0, min: 0, max: SCORE_BREAKDOWN.CA2_MAX },
    classWork: {
      type: Number,
      default: 0,
      min: 0,
      max: SCORE_BREAKDOWN.CLASS_WORK_MAX,
    },
    project: {
      type: Number,
      default: 0,
      min: 0,
      max: SCORE_BREAKDOWN.PROJECT_MAX,
    },
    exam: { type: Number, default: 0, min: 0, max: SCORE_BREAKDOWN.EXAM_MAX },
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
    const { ca1, ca2, classWork, project, exam } = this.scores;
    this.totalScore =
      (ca1 || 0) + (ca2 || 0) + (classWork || 0) + (project || 0) + (exam || 0);
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

  // Matched on `min` alone, highest band first. The bands are written as
  // whole numbers (B is 60-69, A starts at 70), so testing `value <= max` left
  // a gap for every fraction between them: 69.5 matched no band and fell
  // through to F, as did an average of 59.83. The first band whose floor the
  // score reaches is the right one; anything below every floor is the lowest.
  const lowest = GRADE_SCALE[GRADE_SCALE.length - 1];
  const ceiling = Math.max(...GRADE_SCALE.map((b) => b.max));

  // A score above the scale's own ceiling is corrupt input, not a distinction.
  const band =
    value > ceiling
      ? lowest
      : [...GRADE_SCALE]
          .sort((a, b) => b.min - a.min)
          .find((b) => value >= b.min) || lowest;

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
