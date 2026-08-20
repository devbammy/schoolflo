const { Result, calculateGrade } = require('../models/Exam');

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

  return {
    results,
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
  generateReportCard,
  getPrincipalComment,
  assignCompetitionRanks,
};
