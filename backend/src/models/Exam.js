const mongoose = require('mongoose');
const { EXAM_TYPES } = require('../config/constants');

// ─── EXAM SESSION MODEL ─────────────────────────────────────────────────────
const ExamSchema = new mongoose.Schema({
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
}, {
  timestamps: true,
});

ExamSchema.index({ class: 1, term: 1, academicYear: 1, type: 1 });

const Exam = mongoose.model('Exam', ExamSchema);

// ─── RESULT MODEL ─────────────────────────────────────────────────────────────
const ScoreBreakdownSchema = new mongoose.Schema({
  ca1: { type: Number, default: 0, min: 0, max: 10 },
  ca2: { type: Number, default: 0, min: 0, max: 10 },
  midTerm: { type: Number, default: 0, min: 0, max: 10 },
  exam: { type: Number, default: 0, min: 0, max: 70 },
}, { _id: false });

const ResultSchema = new mongoose.Schema({
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
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

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

function calculateGrade(score) {
  if (score >= 70) return { grade: 'A', remark: 'Distinction', gradePoint: 5.0 };
  if (score >= 60) return { grade: 'B', remark: 'Credit', gradePoint: 4.0 };
  if (score >= 50) return { grade: 'C', remark: 'Merit', gradePoint: 3.0 };
  if (score >= 45) return { grade: 'D', remark: 'Pass', gradePoint: 2.0 };
  if (score >= 40) return { grade: 'E', remark: 'Weak Pass', gradePoint: 1.0 };
  return { grade: 'F', remark: 'Fail', gradePoint: 0.0 };
}

ResultSchema.index({ student: 1, term: 1, academicYear: 1 });
ResultSchema.index({ student: 1, subject: 1, term: 1, academicYear: 1 }, { unique: true });
ResultSchema.index({ class: 1, term: 1, academicYear: 1 });

const Result = mongoose.model('Result', ResultSchema);

module.exports = { Exam, Result, calculateGrade };
