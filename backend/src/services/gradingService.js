const { Result, calculateGrade } = require('../models/Exam');
const { GRADE_SCALE } = require('../config/constants');

/**
 * Compute class statistics and positions for all results in a given exam set
 * @param {string} classId
 * @param {string} term
 * @param {string} academicYear
 */
const computeClassStatistics = async (classId, term, academicYear) => {
  const results = await Result.find({ class: classId, term, academicYear, isPublished: false })
    .populate('student', 'firstName lastName studentProfile.admissionNumber')
    .populate('subject', 'name code');

  if (!results.length) return { success: false, message: 'No results found' };

  // Group results by subject to compute per-subject stats
  const bySubject = {};
  results.forEach((r) => {
    const subId = String(r.subject._id);
    if (!bySubject[subId]) bySubject[subId] = [];
    bySubject[subId].push(r);
  });

  const updates = [];

  for (const [, subjectResults] of Object.entries(bySubject)) {
    const scores = subjectResults.map((r) => r.totalScore);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highest = Math.max(...scores);
    const lowest = Math.min(...scores);

    // Sort descending for ranking
    const sorted = [...subjectResults].sort((a, b) => b.totalScore - a.totalScore);

    sorted.forEach((result, idx) => {
      updates.push({
        id: result._id,
        classAverage: parseFloat(avg.toFixed(2)),
        classHighest: highest,
        classLowest: lowest,
        position: idx + 1,
      });
    });
  }

  // Apply updates
  for (const update of updates) {
    await Result.findByIdAndUpdate(update.id, {
      classAverage: update.classAverage,
      classHighest: update.classHighest,
      classLowest: update.classLowest,
      position: update.position,
    });
  }

  return { success: true, processed: updates.length };
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
  const totalGradePoints = results.reduce((sum, r) => sum + (r.gradePoint || 0), 0);
  const gpa = totalGradePoints / results.length;

  // Overall position requires comparing with classmates
  const classId = results[0].class._id;
  const allClassResults = await Result.find({ class: classId, term, academicYear, isPublished: true });

  // Group by student and compute averages
  const studentAverages = {};
  allClassResults.forEach((r) => {
    const sid = String(r.student);
    if (!studentAverages[sid]) studentAverages[sid] = { total: 0, count: 0 };
    studentAverages[sid].total += r.totalScore;
    studentAverages[sid].count += 1;
  });

  const ranked = Object.entries(studentAverages)
    .map(([sid, data]) => ({ studentId: sid, avg: data.total / data.count }))
    .sort((a, b) => b.avg - a.avg);

  const overallPosition = ranked.findIndex((r) => r.studentId === String(studentId)) + 1;

  return {
    results,
    summary: {
      totalSubjects: results.length,
      totalScore: parseFloat(totalScore.toFixed(2)),
      average: parseFloat(average.toFixed(2)),
      gpa: parseFloat(gpa.toFixed(2)),
      overallPosition,
      totalStudentsInClass: ranked.length,
      grade: calculateGrade(average).grade,
      remark: calculateGrade(average).remark,
      principalComment: getPrincipalComment(average),
    },
  };
};

const getPrincipalComment = (average) => {
  if (average >= 70) return 'Excellent performance. Keep up the outstanding work!';
  if (average >= 60) return 'Very good performance. You are doing well.';
  if (average >= 50) return 'Good performance. Work harder for better results.';
  if (average >= 40) return 'Fair performance. Significant improvement is needed.';
  return 'Poor performance. Urgent attention and extra effort required.';
};

module.exports = { computeClassStatistics, generateReportCard, getPrincipalComment };
