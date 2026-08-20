const mongoose = require('mongoose');

/**
 * Named atomic counters.
 *
 * Deliberately a separate collection from Counter (which numbers admissions
 * and staff ids keyed on `year` alone). Adding a scope field to that model
 * would have changed the shape its existing documents are matched by, and a
 * query that stopped matching them would restart the admission sequence at 1
 * and issue duplicate admission numbers.
 */
const SequenceSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

/**
 * Atomically increment and return the next value for `key`.
 * findOneAndUpdate with $inc is a single atomic operation, so concurrent
 * callers can never receive the same number.
 */
SequenceSchema.statics.next = async function (key) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
};

module.exports = mongoose.model('Sequence', SequenceSchema);
