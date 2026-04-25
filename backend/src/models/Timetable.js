const mongoose = require('mongoose');

const DAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

// ── A single period slot ──────────────────────────────────────────────────────
const PeriodSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: DAYS,
      required: true,
    },
    periodNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 16,
    },
    startTime: {
      type: String, // "08:00"
      required: true,
      match: [/^\d{2}:\d{2}$/, 'startTime must be HH:MM'],
    },
    endTime: {
      type: String, // "08:45"
      required: true,
      match: [/^\d{2}:\d{2}$/, 'endTime must be HH:MM'],
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      default: null, // null = free / break period
    },
    teacher: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    room: {
      type: String,
      trim: true,
      default: '',
    },
    isBreak: {
      type: Boolean,
      default: false,
    },
    breakLabel: {
      // e.g. "Assembly", "Break", "Lunch"
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true },
);

// ── Main Timetable document (one per class per term/year) ─────────────────────
const TimetableSchema = new mongoose.Schema(
  {
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    section: {
      type: String,
      trim: true,
      default: '', // empty = applies to whole class
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
    periods: [PeriodSchema],
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    lastEditedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// One timetable per class-section-term-year combination
TimetableSchema.index(
  { class: 1, section: 1, term: 1, academicYear: 1 },
  { unique: true },
);
TimetableSchema.index({ class: 1, isPublished: 1 });

// Virtual: periods grouped by day for easy rendering
TimetableSchema.virtual('schedule').get(function () {
  const map = {};
  DAYS.forEach((d) => {
    map[d] = [];
  });
  (this.periods || []).forEach((p) => {
    if (map[p.day]) map[p.day].push(p);
  });
  DAYS.forEach((d) => {
    map[d].sort((a, b) => a.periodNumber - b.periodNumber);
  });
  return map;
});

module.exports = mongoose.model('Timetable', TimetableSchema);
module.exports.DAYS = DAYS;
