const mongoose = require('mongoose');
const { TERMS } = require('../config/constants');

/**
 * What the form teacher adds to a student's report card for a term, beside the
 * scores: the behaviour ratings and the teacher's comment.
 *
 * One per student per term. Kept apart from Result, which is one row per
 * subject: a comment about the child as a whole repeated on fourteen subject
 * rows would drift the first time one of them was edited.
 *
 * Entered by the class's form teacher (or an admin), and locked to teachers
 * once the class's results for the term are published, like the scores.
 */

// The traits on the school's printed card, in its order.
const BEHAVIOUR_TRAITS = [
  'punctuality',
  'attentiveness',
  'timeManagement',
  'creativity',
  'teamWork',
  'neatness',
  'sport',
];

const BEHAVIOUR_RATINGS = ['Excellent', 'Very Good', 'Good', 'Fair', 'Poor'];

const behaviourFields = Object.fromEntries(
  BEHAVIOUR_TRAITS.map((trait) => [
    trait,
    { type: String, enum: BEHAVIOUR_RATINGS },
  ]),
);

const ReportRemarkSchema = new mongoose.Schema(
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
    term: {
      type: String,
      enum: Object.values(TERMS),
      required: true,
    },
    academicYear: { type: String, required: true },
    behaviour: { type: new mongoose.Schema(behaviourFields, { _id: false }) },
    teacherComment: { type: String, trim: true, maxlength: 300 },
    enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

ReportRemarkSchema.index(
  { student: 1, term: 1, academicYear: 1 },
  { unique: true },
);
ReportRemarkSchema.index({ class: 1, term: 1, academicYear: 1 });

const ReportRemark = mongoose.model('ReportRemark', ReportRemarkSchema);

module.exports = { ReportRemark, BEHAVIOUR_TRAITS, BEHAVIOUR_RATINGS };
