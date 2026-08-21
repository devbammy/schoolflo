const { Result, calculateGrade } = require('../models/Exam');
const { TERMS } = require('../config/constants');

// Terms in the order a session runs them. Cumulative reporting walks this list
// from the first term up to the one being reported on.
const TERM_ORDER = [TERMS.FIRST, TERMS.SECOND, TERMS.THIRD];

const round2 = (value) => parseFloat((Number(value) || 0).toFixed(2));

const mean = (numbers) =>
  numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : 0;

/**
 * Every term from the start of the session up to and including that term.
 *
 * A Second Term report carries First Term with it; a Third Term report carries
 * both. First Term has nothing behind it, so callers treat a single-entry list
 * as 'no cumulative section to print'.
 */
const termsUpTo = (term) => {
  const index = TERM_ORDER.indexOf(term);
  return index < 0 ? [] : TERM_ORDER.slice(0, index + 1);
};

/**
 * Assign competition ranking ("1224") to a list already sorted descending.
 *
 * Students on equal scores share a position and the next position skips
 * accordingly: 82, 82, 79 ranks as 1, 1, 3 — not 1, 2, 3. Sequential ranking
 * of tied scores is the single most disputed number on a Nigerian report card,
 * because it hands two identical performances different positions.
 *
 * @param {Array} sorted   descending by `valueOf(item)`
 * @param {Function} valueOf
 * @returns {Map} item -> position
 */
const assignCompetitionRanks = (sorted, valueOf) => {
  const positions = new Map();
  let lastValue = null;
  let lastRank = 0;

  sorted.forEach((item, index) => {
    const value = valueOf(item);

    if (lastValue !== null && value === lastValue) {
      positions.set(item, lastRank); // tie — same position as the one above
    } else {
      lastRank = index + 1; // skip the positions consumed by the tie
      lastValue = value;
      positions.set(item, lastRank);
    }
  });

  return positions;
};

/**
 * Compute per-subject class statistics and positions for a class/term.
 *
 * Runs over the FULL cohort for the term, published or not. Scoping this to
 * unpublished results meant that re-publishing after a single correction
 * recomputed the average, highest and lowest from that one corrected row and
 * wrote the result over every student's record.
 *
 * @param {string} classId
 * @param {string} term
 * @param {string} academicYear
 */
const computeClassStatistics = async (classId, term, academicYear) => {
  const results = await Result.find({ class: classId, term, academicYear })
    .select('_id subject totalScore')
    .lean();

  if (!results.length) return { success: false, message: 'No results found' };

  // Group results by subject to compute per-subject stats
  const bySubject = new Map();
  results.forEach((r) => {
    const subId = String(r.subject);
    if (!bySubject.has(subId)) bySubject.set(subId, []);
    bySubject.get(subId).push(r);
  });

  const operations = [];

  for (const subjectResults of bySubject.values()) {
    const scores = subjectResults.map((r) => r.totalScore || 0);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);

    const sorted = [...subjectResults].sort(
      (a, b) => (b.totalScore || 0) - (a.totalScore || 0),
    );
    const positions = assignCompetitionRanks(sorted, (r) => r.totalScore || 0);

    for (const result of sorted) {
      operations.push({
        updateOne: {
          filter: { _id: result._id },
          update: {
            $set: {
              classAverage: parseFloat(avg.toFixed(2)),
              classHighest: highest,
              classLowest: lowest,
              position: positions.get(result),
            },
          },
        },
      });
    }
  }

  // One round trip instead of one findByIdAndUpdate per result — a 45 student
  // class across 9 subjects was 405 sequential writes.
  if (operations.length) await Result.bulkWrite(operations);

  return { success: true, processed: operations.length };
};

/**
 * Generate a complete report card for a student for a term
 */
const generateReportCard = async (studentId, term, academicYear) => {
  const results = await Result.find({
    student: studentId,
    term,
    academicYear,
    isPublished: true,
  })
    .populate('subject', 'name code creditUnit isCore')
    .populate('class', 'name')
    .sort({ 'subject.name': 1 });

  if (!results.length) {
    return null;
  }

  const totalScore = results.reduce((sum, r) => sum + r.totalScore, 0);
  const average = totalScore / results.length;

  // GPA weighted by credit unit: Σ(gradePoint × creditUnit) / Σ(creditUnit).
  // A subject carrying 3 credits should move the GPA three times as much as a
  // 1 credit subject; a flat mean over subjects ignored creditUnit entirely.
  const { weightedPoints, totalCredits } = results.reduce(
    (acc, r) => {
      const credits = Number(r.subject?.creditUnit) || 1;
      acc.weightedPoints += (r.gradePoint || 0) * credits;
      acc.totalCredits += credits;
      return acc;
    },
    { weightedPoints: 0, totalCredits: 0 },
  );

  const gpa = totalCredits > 0 ? weightedPoints / totalCredits : 0;

  // Overall position requires comparing with classmates
  const classId = results[0].class._id;
  const allClassResults = await Result.find({
    class: classId,
    term,
    academicYear,
    isPublished: true,
  })
    .select('student totalScore')
    .lean();

  // Group by student and compute averages
  const studentAverages = new Map();
  allClassResults.forEach((r) => {
    const sid = String(r.student);
    const entry = studentAverages.get(sid) || { total: 0, count: 0 };
    entry.total += r.totalScore || 0;
    entry.count += 1;
    studentAverages.set(sid, entry);
  });

  const ranked = [...studentAverages.entries()]
    .map(([sid, data]) => ({
      studentId: sid,
      // Round before ranking so two students separated only by floating point
      // noise are treated as the tie they actually are.
      avg: parseFloat((data.total / data.count).toFixed(2)),
    }))
    .sort((a, b) => b.avg - a.avg);

  const positions = assignCompetitionRanks(ranked, (r) => r.avg);
  const self = ranked.find((r) => r.studentId === String(studentId));
  const overallPosition = self ? positions.get(self) : null;

  // Second and Third Term cards carry the terms before them; First Term gets
  // null and renderers drop the section.
  const cumulative = await computeCumulative(
    studentId,
    classId,
    term,
    academicYear,
  );

  return {
    results,
    cumulative,
    summary: {
      totalSubjects: results.length,
      totalScore: parseFloat(totalScore.toFixed(2)),
      average: parseFloat(average.toFixed(2)),
      gpa: parseFloat(gpa.toFixed(2)),
      totalCredits,
      overallPosition,
      totalStudentsInClass: ranked.length,
      grade: calculateGrade(average).grade,
      remark: calculateGrade(average).remark,
      principalComment: getPrincipalComment(average),
    },
  };
};

/**
 * Fold a student's result rows across several terms into one row per subject.
 *
 * The cumulative score is the mean of the term scores actually present, so a
 * subject a student picked up in Second Term is averaged over the terms it was
 * taken rather than being punished with a zero for First Term.
 *
 * @param {Array} rows      result rows for ONE student: { subject, term, totalScore }
 * @param {string[]} terms  terms to fold, in session order
 */
const buildSubjectCumulatives = (rows, terms) => {
  const bySubject = new Map();

  rows.forEach((row) => {
    const subject = row.subject;
    const id = String(subject?._id || subject);
    if (!bySubject.has(id)) bySubject.set(id, { subject, termScores: {} });
    // Terms outside the reporting window never reach the cumulative column.
    if (terms.includes(row.term)) {
      bySubject.get(id).termScores[row.term] = row.totalScore || 0;
    }
  });

  return [...bySubject.values()]
    .map((entry) => {
      const scored = terms.filter((t) => entry.termScores[t] !== undefined);
      const cumulativeScore = round2(
        mean(scored.map((t) => entry.termScores[t])),
      );
      const grading = calculateGrade(cumulativeScore);

      return {
        subject: entry.subject,
        termScores: entry.termScores,
        termsCounted: scored.length,
        cumulativeScore,
        grade: grading.grade,
        remark: grading.remark,
        gradePoint: grading.gradePoint,
      };
    })
    .filter((entry) => entry.termsCounted > 0)
    .sort((a, b) =>
      String(a.subject?.name || '').localeCompare(
        String(b.subject?.name || ''),
      ),
    );
};

/**
 * Cumulative standing for one student, plus the class ranking it sits in.
 *
 * A student's cumulative average is the mean of their per-subject cumulative
 * scores — not the mean of every row — so subjects with different term
 * coverage still weigh equally, exactly as they do on the termly card.
 *
 * @param {Array} classRows   result rows for the WHOLE class across the terms
 * @param {string} studentId
 * @param {string[]} terms
 */
const summariseCumulative = (classRows, studentId, terms) => {
  const byStudent = new Map();
  classRows.forEach((row) => {
    const sid = String(row.student);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(row);
  });

  const averageFor = (rows) =>
    round2(
      mean(buildSubjectCumulatives(rows, terms).map((s) => s.cumulativeScore)),
    );

  const ranked = [...byStudent.entries()]
    .map(([sid, rows]) => ({ studentId: sid, avg: averageFor(rows) }))
    .sort((a, b) => b.avg - a.avg);

  const positions = assignCompetitionRanks(ranked, (r) => r.avg);
  const self = ranked.find((r) => r.studentId === String(studentId));

  const subjects = buildSubjectCumulatives(
    byStudent.get(String(studentId)) || [],
    terms,
  );

  if (!subjects.length) return null;

  const average = round2(mean(subjects.map((s) => s.cumulativeScore)));

  // The same credit-weighted GPA the termly summary uses, over cumulative grades.
  const { weightedPoints, totalCredits } = subjects.reduce(
    (acc, s) => {
      const credits = Number(s.subject?.creditUnit) || 1;
      acc.weightedPoints += (s.gradePoint || 0) * credits;
      acc.totalCredits += credits;
      return acc;
    },
    { weightedPoints: 0, totalCredits: 0 },
  );

  return {
    terms,
    subjects,
    summary: {
      totalSubjects: subjects.length,
      average,
      gpa: totalCredits > 0 ? round2(weightedPoints / totalCredits) : 0,
      totalCredits,
      grade: calculateGrade(average).grade,
      remark: calculateGrade(average).remark,
      position: self ? positions.get(self) : null,
      totalStudentsInClass: ranked.length,
      principalComment: getPrincipalComment(average),
    },
  };
};

/**
 * Cumulative record for a student as of a given term.
 *
 * Second Term folds in First Term; Third Term folds in First and Second. First
 * Term has nothing to accumulate, so this returns null and every renderer
 * simply omits the cumulative section.
 */
const computeCumulative = async (studentId, classId, term, academicYear) => {
  const terms = termsUpTo(term);
  if (terms.length < 2) return null;

  const classRows = await Result.find({
    class: classId,
    academicYear,
    term: { $in: terms },
    isPublished: true,
  })
    .select('student subject term totalScore')
    .populate('subject', 'name code creditUnit')
    .lean();

  if (!classRows.length) return null;

  return summariseCumulative(classRows, studentId, terms);
};

const getPrincipalComment = (average) => {
  if (average >= 70)
    return 'Excellent performance. Keep up the outstanding work!';
  if (average >= 60) return 'Very good performance. You are doing well.';
  if (average >= 50) return 'Good performance. Work harder for better results.';
  if (average >= 40)
    return 'Fair performance. Significant improvement is needed.';
  return 'Poor performance. Urgent attention and extra effort required.';
};

module.exports = {
  computeClassStatistics,
  termsUpTo,
  buildSubjectCumulatives,
  summariseCumulative,
  computeCumulative,
  TERM_ORDER,
  generateReportCard,
  getPrincipalComment,
  assignCompetitionRanks,
};
