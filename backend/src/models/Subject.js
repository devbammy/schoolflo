const mongoose = require('mongoose');

const SubjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    code: {
      type: String,
      required: [true, 'Subject code is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: String,
    classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
    teachers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    isCore: { type: Boolean, default: true }, // Core vs Elective
    creditUnit: { type: Number, default: 1 },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
  },
);

SubjectSchema.index({ name: 1 });

module.exports = mongoose.model('Subject', SubjectSchema);
