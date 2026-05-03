const mongoose = require('mongoose');

const examScheduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    examType: {
      type: String,
      enum: ['Mid-Term', 'Final Exam', 'Mock Exam', 'External Exam'],
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    term: {
      type: String,
      enum: ['First Term', 'Second Term', 'Third Term'],
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
    },
    sessions: [
      {
        subject: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subject',
          required: true,
        },
        date: {
          type: Date,
          required: true,
        },
        startTime: {
          type: String,
          required: true, // Format: "09:00 AM"
        },
        endTime: {
          type: String,
          required: true, // Format: "11:00 AM"
        },
        duration: {
          type: Number,
          required: true, // In minutes
        },
        venue: {
          type: String,
          required: true,
        },
        invigilators: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
          },
        ],
        maxMarks: {
          type: Number,
          default: 70, // For final exam
        },
        instructions: String,
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Index for queries
examScheduleSchema.index({ class: 1, term: 1, academicYear: 1 });
examScheduleSchema.index({ 'sessions.date': 1 });

module.exports = mongoose.model('ExamSchedule', examScheduleSchema);
