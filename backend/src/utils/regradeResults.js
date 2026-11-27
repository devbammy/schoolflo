/**
 * Re-grade every saved result on the school's own scales.
 *
 * Results saved before the school's A1–F9 keys were adopted carry the old
 * single A–F ladder ('A', 'B', …), and they keep it until their scores are
 * saved again. This writes the grade, remark and grade point each result
 * should have on its class's scale (primary for 'Primary' classes, college for
 * the rest), and the same for CA tracking's term and yearly grades.
 *
 * Totals and scores are never touched: the grade is derived from the total,
 * and the total is the fact.
 *
 * Read-only by default.
 *
 *   node src/utils/regradeResults.js            # report only
 *   node src/utils/regradeResults.js --apply    # write
 */
require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const Class = require('../models/Class');
const CATracker = require('../models/CATracker');
const { Result, calculateGrade } = require('../models/Exam');

const APPLY = process.argv.includes('--apply');
const BATCH = 500;

/**
 * The fields a result should have on its scale, or null if it already does.
 * Pure, so it can be tested without a database.
 */
const regradeOf = (result, level) => {
  const graded = calculateGrade(result.totalScore, level);
  const same =
    result.grade === graded.grade &&
    result.remark === graded.remark &&
    result.gradePoint === graded.gradePoint;
  return same
    ? null
    : {
        grade: graded.grade,
        remark: graded.remark,
        gradePoint: graded.gradePoint,
      };
};

const run = async () => {
  await connectDB();

  const levels = new Map(
    (await Class.find({}).select('level').lean()).map((c) => [
      String(c._id),
      c.level,
    ]),
  );

  // ── Results ──────────────────────────────────────────────────────────────
  let checked = 0;
  let changed = 0;
  const examples = [];
  let ops = [];

  const flush = async () => {
    // bulkWrite skips save hooks, which is fine here: the grade fields are
    // computed explicitly above, and nothing else is written.
    if (APPLY && ops.length) await Result.bulkWrite(ops);
    ops = [];
  };

  const cursor = Result.find({})
    .select('class totalScore grade remark gradePoint')
    .lean()
    .cursor();

  for await (const result of cursor) {
    checked += 1;
    const update = regradeOf(result, levels.get(String(result.class)));
    if (!update) continue;

    changed += 1;
    if (examples.length < 5) {
      examples.push(
        `${result.totalScore}: ${result.grade || '—'} → ${update.grade}`,
      );
    }
    ops.push({
      updateOne: { filter: { _id: result._id }, update: { $set: update } },
    });
    if (ops.length >= BATCH) await flush();
  }
  await flush();

  console.log(`Results: ${changed} of ${checked} need re-grading.`);
  examples.forEach((line) => console.log(`  e.g. ${line}`));

  // ── CA tracking ──────────────────────────────────────────────────────────
  // A tracker has no class of its own, so it takes the level of the class its
  // student's results that year were filed under.
  const levelByStudentYear = new Map();
  const pairs = await Result.aggregate([
    {
      $group: {
        _id: { student: '$student', year: '$academicYear' },
        class: { $first: '$class' },
      },
    },
  ]);
  pairs.forEach((p) =>
    levelByStudentYear.set(
      `${p._id.student}|${p._id.year}`,
      levels.get(String(p.class)),
    ),
  );

  let trackersChanged = 0;
  const trackers = CATracker.find({}).cursor();
  for await (const tracker of trackers) {
    const level = levelByStudentYear.get(
      `${tracker.student}|${tracker.academicYear}`,
    );
    let dirty = false;
    tracker.termRecords.forEach((record) => {
      if (typeof record.total !== 'number') return;
      const grade = calculateGrade(record.total, level).grade;
      if (record.grade !== grade) {
        record.grade = grade;
        dirty = true;
      }
    });
    if (typeof tracker.yearlyAverage === 'number') {
      const yearly = calculateGrade(tracker.yearlyAverage, level).grade;
      if (tracker.yearlyGrade !== yearly) {
        tracker.yearlyGrade = yearly;
        dirty = true;
      }
    }
    if (!dirty) continue;
    trackersChanged += 1;
    if (APPLY) await tracker.save();
  }

  console.log(`CA trackers: ${trackersChanged} need re-grading.`);
  console.log(
    APPLY ? 'Written.' : 'Dry run: nothing was changed. Pass --apply to write.',
  );

  await mongoose.connection.close();
};

if (require.main === module) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { regradeOf };
