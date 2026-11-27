const mongoose = require('mongoose');
const {
  EXAM_TYPES,
  GRADE_SCALES,
  gradeScaleKey,
  SCORE_BREAKDOWN,
} = require('../config/constants');

const GRADE_CODES = GRADE_SCALES.college.map((band) => band.grade);

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
      // The school's A1–F9 codes. The old A–F letters stay valid so a result
      // saved before the change can still be read and re-graded
      // (scripts/regradeResults.js) instead of failing validation.
      enum: [...GRADE_CODES, 'A', 'B', 'C', 'D', 'E', 'F'],
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

// Auto-calculate total score and grade. The grade depends on the class's
// scale (primary or college), so the class's level is read here: the same 72
// is a B2 in Basic 3 and a C4 in JSS 3.
ResultSchema.pre('save', async function () {
  if (this.isModified('scores') || this.isModified('class')) {
    // The total is rebuilt only from changed score parts. A change of class
    // alone re-grades the total the row already has: recomputing it from the
    // parts reset a row saved with a total but no parts to 0.
    if (this.isModified('scores')) {
      const { ca1, ca2, classWork, project, exam } = this.scores || {};
      this.totalScore = roundScore(
        (ca1 || 0) +
          (ca2 || 0) +
          (classWork || 0) +
          (project || 0) +
          (exam || 0),
      );
    }
    const level = await levelOfClass(this.class);
    const grading = calculateGrade(this.totalScore, level);
    this.grade = grading.grade;
    this.remark = grading.remark;
    this.gradePoint = grading.gradePoint;
  }
});

// Scores carry decimals (a project of 7.30), and adding them in binary
// floating point gives 82.60000000000001. Two places is what the card prints.
function roundScore(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

async function levelOfClass(classId) {
  if (!classId) return undefined;
  const Class = mongoose.model('Class');
  const found = await Class.findById(classId).select('level').lean();
  return found?.level;
}

/** The scale a class level uses: primary (Pre-Nursery to Basic 5) or college. */
function gradeScaleFor(level) {
  return GRADE_SCALES[gradeScaleKey(level)];
}

/**
 * The lowest passing score on a level's scale: anything below it is F9.
 * Promotion counts failed subjects against it, so primary fails below 40 and
 * the college below 50, as the school's two keys say.
 */
function passMarkFor(level) {
  const scale = gradeScaleFor(level);
  const fail = scale.find((band) => band.grade === 'F9');
  return Math.min(...scale.filter((b) => b !== fail).map((b) => b.min));
}

/**
 * Resolve a score to its band on the school's grading scale for that level.
 * Reads GRADE_SCALES in config/constants.js — there is no second ladder to
 * keep in sync when the school changes its boundaries. A level that is not
 * given is graded on the college scale, the stricter of the two.
 */
function calculateGrade(score, level) {
  const GRADE_SCALE = gradeScaleFor(level);
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

module.exports = {
  Exam,
  Result,
  calculateGrade,
  gradeScaleFor,
  passMarkFor,
  roundScore,
  GRADE_CODES,
};
