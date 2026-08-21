/**
 * One-off migration for the change of grading scheme.
 *
 * The old breakdown was CA1 10 + CA2 10 + Mid-Term 10 + Exam 70. The school now
 * grades on CA1 10 + CA2 10 + Class Work 10 + Project 10 + Exam 60, so every
 * stored result carries a `midTerm` field that no longer exists on the schema
 * and is missing `classWork`/`project`.
 *
 * What this does, per result and per CA-tracker term entry:
 *   - moves `midTerm` into `classWork` (the closest equivalent component),
 *   - defaults `project` to 0,
 *   - drops the `midTerm` field.
 *
 * Exam scores are NOT rescaled: an old exam mark out of 70 is not comparable to
 * one out of 60, and silently shrinking it would rewrite history. Rows whose
 * exam score exceeds the new 60 cap are reported at the end so the school can
 * decide what to do with them — they stay readable, but they will fail
 * validation if anyone edits and re-saves them.
 *
 * Run with:  node src/utils/migrateScoreBreakdown.js [--dry-run]
 */
require('dotenv').config();
const mongoose = require('mongoose');
const { SCORE_BREAKDOWN } = require('../config/constants');

const DRY_RUN = process.argv.includes('--dry-run');

const migrateCollection = async (collection, prefix) => {
  const midTermField = prefix ? `${prefix}.midTerm` : 'midTerm';
  const filter = { [midTermField]: { $exists: true } };
  const count = await collection.countDocuments(filter);

  if (DRY_RUN || count === 0) return count;

  const setStage = prefix
    ? {
        [prefix]: {
          $map: {
            input: `$${prefix}`,
            as: 'entry',
            in: {
              $mergeObjects: [
                '$$entry',
                {
                  classWork: { $ifNull: ['$$entry.midTerm', 0] },
                  project: { $ifNull: ['$$entry.project', 0] },
                },
              ],
            },
          },
        },
      }
    : {
        'scores.classWork': { $ifNull: ['$scores.midTerm', 0] },
        'scores.project': { $ifNull: ['$scores.project', 0] },
      };

  await collection.updateMany(filter, [{ $set: setStage }]);
  await collection.updateMany(filter, {
    $unset: prefix
      ? { [`${prefix}.$[].midTerm`]: '' }
      : { 'scores.midTerm': '' },
  });

  return count;
};

(async () => {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });

  const db = mongoose.connection.db;

  const results = await migrateCollection(db.collection('results'), null);
  const trackers = await migrateCollection(
    db.collection('catrackers'),
    'terms',
  );

  const overCap = await db
    .collection('results')
    .countDocuments({ 'scores.exam': { $gt: SCORE_BREAKDOWN.EXAM_MAX } });

  console.log(`${DRY_RUN ? '[dry run] ' : ''}results migrated: ${results}`);
  console.log(
    `${DRY_RUN ? '[dry run] ' : ''}CA trackers migrated: ${trackers}`,
  );
  if (overCap > 0) {
    console.warn(
      `${overCap} result(s) have an exam score above the new cap of ` +
        `${SCORE_BREAKDOWN.EXAM_MAX}. They were left untouched — re-enter or ` +
        `rescale them before those subjects are edited again.`,
    );
  }

  await mongoose.disconnect();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
