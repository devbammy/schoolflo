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

/**
 * Make sure the next value for `key` lands above `floor`, for numbering that
 * existed before its sequence did. $max can only raise the value, so a stale
 * floor from a slower caller cannot take the sequence backwards.
 */
SequenceSchema.statics.atLeast = async function (key, floor) {
  await this.updateOne(
    { key },
    { $max: { seq: floor } },
    { upsert: true, setDefaultsOnInsert: true },
  );
};

module.exports = mongoose.model('Sequence', SequenceSchema);
