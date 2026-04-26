const mongoose = require('mongoose');

const EVENT_TYPES = [
  'Term Start',
  'Term End',
  'Exam',
  'Holiday',
  'Event',
  'PTA Meeting',
  'Sports Day',
  'Cultural Day',
  'Resumption',
  'Closing',
  'Other',
];

const EVENT_COLORS = {
  'Term Start': '#10B981',
  'Term End': '#EF4444',
  Exam: '#7C3AED',
  Holiday: '#F59E0B',
  Event: '#0891B2',
  'PTA Meeting': '#EC4899',
  'Sports Day': '#F97316',
  'Cultural Day': '#84CC16',
  Resumption: '#10B981',
  Closing: '#EF4444',
  Other: '#6B7280',
};

// ── Single calendar event ─────────────────────────────────────────────────────
const CalendarEventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Event title is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: EVENT_TYPES,
      required: true,
      default: 'Event',
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      // defaults to startDate (single-day event) — set in pre-save
    },
    isAllDay: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    targetAudience: {
      type: [String],
      enum: ['All', 'Admin', 'Teacher', 'Student', 'Parent'],
      default: ['All'],
    },
    color: {
      type: String,
      default: '#0891B2',
    },
    isRecurring: {
      type: Boolean,
      default: false,
    },
  },
  { _id: true },
);

CalendarEventSchema.pre('save', function (next) {
  if (!this.endDate) this.endDate = this.startDate;
  // Auto-assign color based on type if not customised
  if (!this.color || this.color === '#0891B2') {
    this.color = EVENT_COLORS[this.type] || '#0891B2';
  }
  next();
});

// ── Term definition ───────────────────────────────────────────────────────────
const TermSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      enum: ['First Term', 'Second Term', 'Third Term'],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    midTermBreakStart: { type: Date },
    midTermBreakEnd: { type: Date },
    examStartDate: { type: Date },
    examEndDate: { type: Date },
    resumptionDate: { type: Date },
  },
  { _id: true },
);

// ── Academic Calendar (one per academic year) ─────────────────────────────────
const AcademicCalendarSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: [true, 'Academic year is required'],
      unique: true,
      trim: true,
      // e.g. "2024/2025"
    },
    sessionStartDate: {
      type: Date,
      required: true,
    },
    sessionEndDate: {
      type: Date,
      required: true,
    },
    terms: {
      type: [TermSchema],
      validate: {
        validator: (v) => v.length >= 1 && v.length <= 3,
        message: 'Calendar must have 1–3 terms',
      },
    },
    events: [CalendarEventSchema],
    isActive: {
      type: Boolean,
      default: false, // only one calendar should be active at a time
    },
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

// Virtual: current term based on today's date
AcademicCalendarSchema.virtual('currentTerm').get(function () {
  const now = new Date();
  return (
    this.terms.find(
      (t) => now >= new Date(t.startDate) && now <= new Date(t.endDate),
    ) || null
  );
});

// Virtual: upcoming events (next 30 days)
AcademicCalendarSchema.virtual('upcomingEvents').get(function () {
  const now = new Date();
  const horizon = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return (this.events || [])
    .filter(
      (e) => new Date(e.startDate) >= now && new Date(e.startDate) <= horizon,
    )
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
});

AcademicCalendarSchema.index({ academicYear: 1 }, { unique: true });
AcademicCalendarSchema.index({ isActive: 1 });

module.exports = mongoose.model('AcademicCalendar', AcademicCalendarSchema);
module.exports.EVENT_TYPES = EVENT_TYPES;
module.exports.EVENT_COLORS = EVENT_COLORS;
