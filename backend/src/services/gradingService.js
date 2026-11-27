const { Result, calculateGrade } = require('../models/Exam');
const User = require('../models/User');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const AcademicCalendar = require('../models/AcademicCalendar');
const Promotion = require('../models/Promotion');
const { ReportRemark } = require('../models/ReportRemark');
const {
  TERMS,
  GRADE_SCALES,
  gradeScaleKey,
  HEAD_COMMENTS,
  HEAD_COMMENT_LABELS,
} = require('../config/constants');

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
 * The school's report card for one student and term, everything its printed
 * design carries (see the first-, second- and third-term sheets it supplied):
 *
 *   header      obtainable/obtained score, the student's average and grade,
 *               learners in class, highest/lowest/class average, position,
 *               days present/absent, next term's date, the promotion outcome
 *   per subject the five score parts, total, grade, comment, position, and on
 *               Second and Third Term the cumulative columns
 *   footer      behaviour ratings, teacher's comment, head's comment
 *
 * Figures are compared within the student's ARM (JSS 3 B against JSS 3 B) by
 * default, as the school asked; `scope: 'class'` compares the whole class, for
 * the admin's view. A class with no arms is the same either way.
 */
const generateReportCard = async (
  studentId,
  term,
  academicYear,
  { scope = 'arm' } = {},
) => {
  const results = await Result.find({
    student: studentId,
    term,
    academicYear,
    isPublished: true,
  })
    .populate('subject', 'name code creditUnit isCore')
    .populate('class', 'name level')
    .sort({ 'subject.name': 1 });

  if (!results.length) {
    return null;
  }

  const classDoc = results[0].class;
  const classId = classDoc._id;
  const level = classDoc.level;
  const scaleKey = gradeScaleKey(level);

  const student = await User.findById(studentId)
    .select('studentProfile.section')
    .lean();
  const section = student?.studentProfile?.section || null;

  // Everyone this student is compared with: the class's published results for
  // the term, narrowed to the student's arm unless the whole class was asked.
  const classRows = await Result.find({
    class: classId,
    term,
    academicYear,
    isPublished: true,
  })
    .select('student subject totalScore')
    .lean();

  const cohort = await cohortOf(classRows, section, scope);
  const cohortRows = classRows.filter((r) => cohort.has(String(r.student)));

  // Student averages, rounded before ranking so float noise reads as a tie.
  const totals = new Map();
  cohortRows.forEach((r) => {
    const sid = String(r.student);
    const entry = totals.get(sid) || { total: 0, count: 0 };
    entry.total += r.totalScore || 0;
    entry.count += 1;
    totals.set(sid, entry);
  });
  const ranked = [...totals.entries()]
    .map(([sid, t]) => ({ studentId: sid, avg: round2(t.total / t.count) }))
    .sort((a, b) => b.avg - a.avg);
  const positions = assignCompetitionRanks(ranked, (r) => r.avg);
  const self = ranked.find((r) => r.studentId === String(studentId));
  const averages = ranked.map((r) => r.avg);

  // Each subject's position, within the same cohort.
  const subjectPosition = new Map();
  const bySubject = new Map();
  cohortRows.forEach((r) => {
    const key = String(r.subject);
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key).push(r);
  });
  bySubject.forEach((rows, key) => {
    const sorted = [...rows].sort(
      (a, b) => (b.totalScore || 0) - (a.totalScore || 0),
    );
    const ranks = assignCompetitionRanks(sorted, (r) => r.totalScore || 0);
    const mine = sorted.find((r) => String(r.student) === String(studentId));
    if (mine) subjectPosition.set(key, ranks.get(mine));
  });

  const rows = results.map((r) => ({
    ...r.toObject(),
    position: subjectPosition.get(String(r.subject._id)) ?? r.position,
  }));

  const obtained = round2(results.reduce((s, r) => s + (r.totalScore || 0), 0));
  const average = round2(obtained / results.length);
  const grading = calculateGrade(average, level);

  // GPA weighted by credit unit: Σ(gradePoint × creditUnit) / Σ(creditUnit).
  const { weightedPoints, totalCredits } = results.reduce(
    (acc, r) => {
      const credits = Number(r.subject?.creditUnit) || 1;
      acc.weightedPoints += (r.gradePoint || 0) * credits;
      acc.totalCredits += credits;
      return acc;
    },
    { weightedPoints: 0, totalCredits: 0 },
  );

  const [cumulative, attendance, remark, nextTerm, promotion] =
    await Promise.all([
      computeCumulative(studentId, classId, term, academicYear, {
        level,
        cohort,
      }),
      attendanceFor(studentId, term, academicYear),
      ReportRemark.findOne({ student: studentId, term, academicYear })
        .select('behaviour teacherComment')
        .lean(),
      nextTermAfter(term, academicYear),
      term === TERMS.THIRD
        ? promotionOutcome(studentId, academicYear)
        : Promise.resolve(null),
    ]);

  return {
    results: rows,
    cumulative,
    gradeScale: GRADE_SCALES[scaleKey],
    scaleKey,
    attendance,
    behaviour: remark?.behaviour || null,
    teacherComment: remark?.teacherComment || null,
    nextTerm,
    promotion,
    summary: {
      scope: section && scope === 'arm' ? 'arm' : 'class',
      section,
      totalSubjects: results.length,
      obtainableScore: results.length * 100,
      obtainedScore: obtained,
      totalScore: obtained,
      average,
      gpa: totalCredits > 0 ? round2(weightedPoints / totalCredits) : 0,
      totalCredits,
      overallPosition: self ? positions.get(self) : null,
      totalStudentsInClass: ranked.length,
      highestAverage: averages.length ? Math.max(...averages) : null,
      lowestAverage: averages.length ? Math.min(...averages) : null,
      classAverage: averages.length ? round2(mean(averages)) : null,
      grade: grading.grade,
      remark: grading.remark,
      gradeLabel: `${grading.grade} (${grading.remark})`,
      principalComment: HEAD_COMMENTS[grading.grade] || '',
      headCommentLabel: HEAD_COMMENT_LABELS[scaleKey],
    },
  };
};

const sameSection = (a, b) =>
  String(a || '')
    .trim()
    .toLowerCase() ===
  String(b || '')
    .trim()
    .toLowerCase();

/**
 * The student ids a card compares against: every student with a published
 * result in the class, or only those in the same arm. A student's arm is the
 * one on their profile now: a pupil moved from B to A mid-session is compared
 * with A. That is the school's arm list as it stands, which is what a card
 * printed today should show.
 */
const cohortOf = async (classRows, section, scope) => {
  const ids = [...new Set(classRows.map((r) => String(r.student)))];
  if (scope !== 'arm' || !section) return new Set(ids);

  const students = await User.find({ _id: { $in: ids } })
    .select('studentProfile.section')
    .lean();
  return new Set(
    students
      .filter((s) => sameSection(s.studentProfile?.section, section))
      .map((s) => String(s._id)),
  );
};

/**
 * Days present and absent for the term, from the class register. Late counts
 * as present (the child was in school), Excused as absent (they were not).
 * Null when no register was kept, so the card prints blanks, not zeros.
 */
const attendanceFor = async (studentId, term, academicYear) => {
  const summary = await Attendance.getSummary(studentId, term, academicYear);
  if (!summary.total) return null;
  return {
    daysPresent: summary.Present + summary.Late,
    daysAbsent: summary.Absent + summary.Excused,
  };
};

// "2024/2025" → "2025/2026"
const nextSession = (academicYear) => {
  const start = parseInt(String(academicYear).split('/')[0], 10);
  return Number.isFinite(start) ? `${start + 1}/${start + 2}` : null;
};

/**
 * "Next term begins on": the start date of the term after this one, from the
 * academic calendar. After Third Term that is First Term of the next session,
 * so its calendar has to exist for the date to print; until then the card
 * names the term and leaves the date blank.
 */
const nextTermAfter = async (term, academicYear) => {
  const index = TERM_ORDER.indexOf(term);
  const nextName = TERM_ORDER[(index + 1) % TERM_ORDER.length];
  const year =
    index === TERM_ORDER.length - 1 ? nextSession(academicYear) : academicYear;
  if (!year) return null;

  const calendar = await AcademicCalendar.findOne({ academicYear: year })
    .select('terms')
    .lean();
  const found = calendar?.terms?.find((t) => t.name === nextName);
  return {
    term: nextName,
    academicYear: year,
    startDate: found?.startDate || null,
  };
};

/**
 * The promotion outcome printed on a Third Term card (PROMOTED, REPEATED,
 * GRADUATED). Only once the batch has been applied: before that the decision
 * can still change, and a card is something a family keeps.
 */
const promotionOutcome = async (studentId, academicYear) => {
  const batch = await Promotion.findOne({
    academicYear,
    appliedAt: { $ne: null },
    'students.student': studentId,
  })
    .select('students.$')
    .lean();
  return batch?.students?.[0]?.status || null;
};

/**
 * Fold a student's result rows across several terms into one row per subject.
 *
 * The cumulative score is the total of the terms the student actually has,
 * divided by how many that is, and the card says so: obtainable is 100 per
 * term counted. A subject picked up in Second Term is averaged over the terms
 * it was taken, not punished with a zero for First Term, as the school asked.
 *
 * @param {Array} rows      result rows for ONE student: { subject, term, totalScore }
 * @param {string[]} terms  terms to fold, in session order
 * @param {string} level    the class's level, which picks the grading scale
 */
const buildSubjectCumulatives = (rows, terms, level) => {
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
      const obtainedScore = round2(
        scored.reduce((sum, t) => sum + entry.termScores[t], 0),
      );
      const cumulativeScore = scored.length
        ? round2(obtainedScore / scored.length)
        : 0;
      const grading = calculateGrade(cumulativeScore, level);

      return {
        subject: entry.subject,
        termScores: entry.termScores,
        termsCounted: scored.length,
        obtainableScore: scored.length * 100,
        obtainedScore,
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
 * Cumulative standing for one student, plus the ranking it sits in.
 *
 * A student's cumulative average is the mean of their per-subject cumulative
 * scores — not the mean of every row — so subjects with different term
 * coverage still weigh equally, exactly as they do on the termly card.
 *
 * @param {Array} classRows   result rows for the cohort across the terms
 * @param {string} studentId
 * @param {string[]} terms
 * @param {string} level
 */
const summariseCumulative = (classRows, studentId, terms, level) => {
  const byStudent = new Map();
  classRows.forEach((row) => {
    const sid = String(row.student);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(row);
  });

  const averageFor = (rows) =>
    round2(
      mean(
        buildSubjectCumulatives(rows, terms, level).map(
          (s) => s.cumulativeScore,
        ),
      ),
    );

  const ranked = [...byStudent.entries()]
    .map(([sid, rows]) => ({ studentId: sid, avg: averageFor(rows) }))
    .sort((a, b) => b.avg - a.avg);

  const positions = assignCompetitionRanks(ranked, (r) => r.avg);
  const self = ranked.find((r) => r.studentId === String(studentId));

  const subjects = buildSubjectCumulatives(
    byStudent.get(String(studentId)) || [],
    terms,
    level,
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

  const grading = calculateGrade(average, level);

  return {
    terms,
    subjects,
    summary: {
      totalSubjects: subjects.length,
      average,
      gpa: totalCredits > 0 ? round2(weightedPoints / totalCredits) : 0,
      totalCredits,
      grade: grading.grade,
      remark: grading.remark,
      position: self ? positions.get(self) : null,
      totalStudentsInClass: ranked.length,
      principalComment: HEAD_COMMENTS[grading.grade] || '',
    },
  };
};

/**
 * Cumulative record for a student as of a given term.
 *
 * Second Term folds in First Term; Third Term folds in First and Second. First
 * Term has nothing to accumulate, so this returns null and every renderer
 * simply omits the cumulative section.
 *
 * `cohort` (a Set of student ids) narrows the ranking to the student's arm,
 * as the termly figures are; without it the whole class is ranked.
 */
const computeCumulative = async (
  studentId,
  classId,
  term,
  academicYear,
  { level, cohort } = {},
) => {
  const terms = termsUpTo(term);
  if (terms.length < 2) return null;

  const classLevel =
    level ?? (await Class.findById(classId).select('level').lean())?.level;

  const classRows = await Result.find({
    class: classId,
    academicYear,
    term: { $in: terms },
    isPublished: true,
  })
    .select('student subject term totalScore')
    .populate('subject', 'name code creditUnit')
    .lean();

  const rows = cohort
    ? classRows.filter((r) => cohort.has(String(r.student)))
    : classRows;

  if (!rows.length) return null;

  return summariseCumulative(rows, studentId, terms, classLevel);
};

/**
 * A class's standings for a term, for the admin: every student's average and
 * position, with the highest, lowest and class average, either for one arm
 * (`section`) or for the whole class together. Published results only, the
 * same figures the report cards print.
 */
const summariseClass = async (
  classId,
  term,
  academicYear,
  { section } = {},
) => {
  const classRows = await Result.find({
    class: classId,
    term,
    academicYear,
    isPublished: true,
  })
    .select('student totalScore')
    .lean();

  const cohort = await cohortOf(classRows, section, section ? 'arm' : 'class');
  const totals = new Map();
  classRows
    .filter((r) => cohort.has(String(r.student)))
    .forEach((r) => {
      const sid = String(r.student);
      const entry = totals.get(sid) || { total: 0, count: 0 };
      entry.total += r.totalScore || 0;
      entry.count += 1;
      totals.set(sid, entry);
    });

  const ranked = [...totals.entries()]
    .map(([sid, t]) => ({
      studentId: sid,
      subjects: t.count,
      obtainedScore: round2(t.total),
      average: round2(t.total / t.count),
    }))
    .sort((a, b) => b.average - a.average);
  const positions = assignCompetitionRanks(ranked, (r) => r.average);

  const level = (await Class.findById(classId).select('level').lean())?.level;
  const people = await User.find({
    _id: { $in: ranked.map((r) => r.studentId) },
  })
    .select(
      'firstName lastName studentProfile.section studentProfile.admissionNumber',
    )
    .lean();
  const byId = new Map(people.map((p) => [String(p._id), p]));
  const averages = ranked.map((r) => r.average);

  return {
    scope: section ? 'arm' : 'class',
    section: section || null,
    learners: ranked.length,
    highestAverage: averages.length ? Math.max(...averages) : null,
    lowestAverage: averages.length ? Math.min(...averages) : null,
    classAverage: averages.length ? round2(mean(averages)) : null,
    students: ranked.map((r) => {
      const p = byId.get(r.studentId) || {};
      return {
        ...r,
        position: positions.get(r),
        firstName: p.firstName,
        lastName: p.lastName,
        section: p.studentProfile?.section || null,
        admissionNumber: p.studentProfile?.admissionNumber || null,
        grade: calculateGrade(r.average, level).grade,
      };
    }),
  };
};

/** The head's comment for an average, on the scale of that class level. */
const getPrincipalComment = (average, level) =>
  HEAD_COMMENTS[calculateGrade(average, level).grade] || '';

module.exports = {
  computeClassStatistics,
  termsUpTo,
  buildSubjectCumulatives,
  summariseCumulative,
  computeCumulative,
  TERM_ORDER,
  generateReportCard,
  getPrincipalComment,
  summariseClass,
  assignCompetitionRanks,
};
