const mongoose = require('mongoose');

const ClassSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Class name is required'],
      trim: true,
      unique: true,
      // e.g., "JSS1", "JSS2", "SS1", "SS2"
    },
    level: {
      type: String,
      enum: ['JSS', 'SS', 'Primary', 'College'],
      required: true,
    },
    sections: [
      {
        name: { type: String, required: true }, // e.g., "A", "B", "Gold"
        capacity: { type: Number, default: 40 },
        classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      },
    ],
    subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
    academicYear: {
      type: String,
      required: true,
      default: () => {
        const year = new Date().getFullYear();
        return `${year}/${year + 1}`;
      },
    },
    isActive: { type: Boolean, default: true },
    description: String,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual: Student count
ClassSchema.virtual('studentCount', {
  ref: 'User',
  localField: '_id',
  foreignField: 'studentProfile.class',
  count: true,
});

ClassSchema.index({ name: 1, academicYear: 1 }, { unique: true });

module.exports = mongoose.model('Class', ClassSchema);
