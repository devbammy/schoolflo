const mongoose = require('mongoose');

const promotionSchema = new mongoose.Schema(
  {
    academicYear: {
      type: String,
      required: true,
    },
    fromClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    toClass: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    students: [
      {
        student: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        status: {
          type: String,
          enum: ['Promoted', 'Repeated', 'Withdrawn', 'Graduated'],
          required: true,
        },
        promotedTo: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Class',
        },
        yearlyAverage: Number,
        yearlyPosition: Number,
        totalStudents: Number,
        failedSubjects: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Subject',
          },
        ],
        failedCount: {
          type: Number,
          default: 0,
        },
        comment: String,
        processedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        processedAt: Date,
      },
    ],
    criteria: {
      minimumAverage: {
        type: Number,
        default: 40, // Students below this repeat
      },
      maximumFailures: {
        type: Number,
        default: 3, // More than 3 failed subjects = repeat
      },
      coreSubjectsMustPass: {
        type: Boolean,
        default: true,
      },
      coreSubjects: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Subject',
        },
      ],
    },
    status: {
      type: String,
      enum: ['Draft', 'Processing', 'Completed'],
      default: 'Draft',
    },
    completedAt: Date,
    // Separate from status: 'Completed' only means the decisions have been made.
    // Without a record of having been applied, a batch could be applied again a
    // year later and send a whole cohort back to the class they had left.
    appliedAt: Date,
    appliedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Index for queries
promotionSchema.index({ academicYear: 1, fromClass: 1 });
promotionSchema.index({ 'students.student': 1 });

module.exports = mongoose.model('Promotion', promotionSchema);
