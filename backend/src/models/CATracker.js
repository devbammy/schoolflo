const mongoose = require('mongoose');

const caTrackerSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    termRecords: [
      {
        term: {
          type: String,
          enum: ['First Term', 'Second Term', 'Third Term'],
          required: true,
        },
        ca1: {
          type: Number,
          min: 0,
          max: 10,
        },
        ca2: {
          type: Number,
          min: 0,
          max: 10,
        },
        classWork: {
          type: Number,
          min: 0,
          max: 10,
        },
        project: {
          type: Number,
          min: 0,
          max: 10,
        },
        exam: {
          type: Number,
          min: 0,
          max: 60,
        },
        total: {
          type: Number,
          min: 0,
          max: 100,
        },
        grade: String,
        position: Number,
        classAverage: Number,
        improvement: Number, // Calculated: current total - previous term total
      },
    ],
    yearlyAverage: Number,
    yearlyGrade: String,
    trend: {
      type: String,
      enum: ['Improving', 'Declining', 'Stable', 'Inconsistent'],
      default: 'Stable',
    },
  },
  {
    timestamps: true,
  },
);

// Unique constraint: one tracker per student per subject per year
caTrackerSchema.index(
  { student: 1, subject: 1, academicYear: 1 },
  { unique: true },
);

// Method to calculate trend
caTrackerSchema.methods.calculateTrend = function () {
  if (!this.termRecords || this.termRecords.length < 2) {
    this.trend = 'Stable';
    return;
  }

  // 1. Always sort terms properly
  const sorted = [...this.termRecords].sort((a, b) => {
    const order = {
      'First Term': 1,
      'Second Term': 2,
      'Third Term': 3,
    };
    return order[a.term] - order[b.term];
  });

  const totals = sorted
    .map((r) => r.total)
    .filter((t) => typeof t === 'number');

  if (totals.length < 2) {
    this.trend = 'Stable';
    return;
  }

  let improvements = 0;
  let declines = 0;

  for (let i = 1; i < totals.length; i++) {
    const diff = totals[i] - totals[i - 1];

    if (diff >= 5) improvements++;
    else if (diff <= -5) declines++;
  }

  // 2. Smarter classification (works with 3 terms)

  const totalChange = totals[totals.length - 1] - totals[0];

  if (totalChange >= 5) {
    this.trend = 'Improving';
  } else if (totalChange <= -5) {
    this.trend = 'Declining';
  } else if (improvements > 0 && declines > 0) {
    this.trend = 'Inconsistent';
  } else {
    this.trend = 'Stable';
  }
};

// Method to calculate yearly average. `level` is the class's, which picks
// the grading scale (primary or college) for the yearly grade.
caTrackerSchema.methods.calculateYearlyAverage = function (level) {
  const validTotals = this.termRecords
    .map((r) => r.total)
    .filter((t) => t !== undefined && t !== null);

  if (validTotals.length === 0) {
    this.yearlyAverage = 0;
    return;
  }

  this.yearlyAverage = parseFloat(
    (
      validTotals.reduce((sum, val) => sum + val, 0) / validTotals.length
    ).toFixed(2),
  );

  // Graded on the school's scale for the class's level. This used to be its
  // own A–F ladder written out here, a second copy of the scale that would
  // have printed a third grade beside the card's two.
  // Required lazily: Exam requires nothing from here, but loading it at the top
  // of a model file risks an order-dependent cycle as models grow.
  const { calculateGrade } = require('./Exam');
  this.yearlyGrade = calculateGrade(this.yearlyAverage, level).grade;
};

module.exports = mongoose.model('CATracker', caTrackerSchema);
