const {
  termsUpTo,
  buildSubjectCumulatives,
  summariseCumulative,
} = require('../../src/services/gradingService');

/**
 * Cumulative reporting: a Second Term card carries First Term with it, and a
 * Third Term card carries both. These numbers go straight onto report cards
 * and into promotion arguments, so the folding rules are pinned here.
 */

const maths = { _id: 'sub-maths', name: 'Mathematics', creditUnit: 3 };
const english = { _id: 'sub-english', name: 'English', creditUnit: 2 };

const row = (student, subject, term, totalScore) => ({
  student,
  subject,
  term,
  totalScore,
});

describe('termsUpTo', () => {
  it('gives First Term nothing to accumulate', () => {
    expect(termsUpTo('First Term')).toEqual(['First Term']);
  });

  it('folds First Term into Second Term', () => {
    expect(termsUpTo('Second Term')).toEqual(['First Term', 'Second Term']);
  });

  it('folds both earlier terms into Third Term', () => {
    expect(termsUpTo('Third Term')).toEqual([
      'First Term',
      'Second Term',
      'Third Term',
    ]);
  });

  it('returns nothing for an unknown term', () => {
    expect(termsUpTo('Fourth Term')).toEqual([]);
  });
});

describe('buildSubjectCumulatives', () => {
  const terms = ['First Term', 'Second Term'];

  it('averages a subject over the terms it was taken', () => {
    const [subject] = buildSubjectCumulatives(
      [row('s1', maths, 'First Term', 78), row('s1', maths, 'Second Term', 84)],
      terms,
      'Primary',
    );

    expect(subject.cumulativeScore).toBe(81);
    expect(subject.grade).toBe('A1');
    expect(subject.obtainableScore).toBe(200);
    expect(subject.obtainedScore).toBe(162);
    expect(subject.termScores).toEqual({
      'First Term': 78,
      'Second Term': 84,
    });
  });

  // The school's own sheets: Basic 1 Second Term, Basic Science and
  // Technology (165 of 200), and JS 1 Third Term, Agricultural Science
  // (214.20 of 300).
  it("reproduces the cumulative columns on the school's Second Term card", () => {
    const [subject] = buildSubjectCumulatives(
      [row('s1', maths, 'First Term', 86), row('s1', maths, 'Second Term', 79)],
      terms,
      'Primary',
    );

    expect(subject).toMatchObject({
      obtainableScore: 200,
      obtainedScore: 165,
      cumulativeScore: 82.5,
      grade: 'A1',
    });
  });

  it("reproduces the cumulative columns on the school's Third Term card", () => {
    const [subject] = buildSubjectCumulatives(
      [
        row('s1', maths, 'First Term', 70.3),
        row('s1', maths, 'Second Term', 70.9),
        row('s1', maths, 'Third Term', 73),
      ],
      ['First Term', 'Second Term', 'Third Term'],
      'JSS',
    );

    expect(subject).toMatchObject({
      obtainableScore: 300,
      obtainedScore: 214.2,
      cumulativeScore: 71.4,
      grade: 'C4',
    });
  });

  it('states the terms it divided by when a term is missing', () => {
    const [subject] = buildSubjectCumulatives(
      [row('s1', maths, 'Second Term', 70), row('s1', maths, 'Third Term', 80)],
      ['First Term', 'Second Term', 'Third Term'],
      'JSS',
    );

    expect(subject).toMatchObject({
      termsCounted: 2,
      obtainableScore: 200,
      obtainedScore: 150,
      cumulativeScore: 75,
    });
  });

  it('averages only over terms present, never over a missing term as zero', () => {
    // A subject picked up in Second Term must not be dragged down by a First
    // Term it was never offered in.
    const [subject] = buildSubjectCumulatives(
      [row('s1', maths, 'Second Term', 70)],
      terms,
    );

    expect(subject.cumulativeScore).toBe(70);
    expect(subject.termsCounted).toBe(1);
  });

  it('ignores terms outside the reporting window', () => {
    const [subject] = buildSubjectCumulatives(
      [
        row('s1', maths, 'First Term', 40),
        row('s1', maths, 'Second Term', 60),
        row('s1', maths, 'Third Term', 100),
      ],
      terms,
    );

    expect(subject.cumulativeScore).toBe(50);
    expect(subject.termScores['Third Term']).toBeUndefined();
  });

  it('sorts subjects by name so the column order is stable', () => {
    const subjects = buildSubjectCumulatives(
      [
        row('s1', maths, 'First Term', 50),
        row('s1', english, 'First Term', 50),
      ],
      terms,
    );

    expect(subjects.map((s) => s.subject.name)).toEqual([
      'English',
      'Mathematics',
    ]);
  });

  it('rounds to two decimals rather than printing float noise', () => {
    const [subject] = buildSubjectCumulatives(
      [
        row('s1', maths, 'First Term', 70),
        row('s1', maths, 'Second Term', 75),
        row('s1', maths, 'Third Term', 71),
      ],
      ['First Term', 'Second Term', 'Third Term'],
    );

    expect(subject.cumulativeScore).toBe(72);
  });
});

describe('summariseCumulative', () => {
  const terms = ['First Term', 'Second Term'];

  const classRows = [
    row('s1', maths, 'First Term', 80),
    row('s1', maths, 'Second Term', 90),
    row('s1', english, 'First Term', 60),
    row('s1', english, 'Second Term', 70),
    row('s2', maths, 'First Term', 90),
    row('s2', maths, 'Second Term', 90),
    row('s2', english, 'First Term', 90),
    row('s2', english, 'Second Term', 90),
  ];

  it('averages the per-subject cumulatives, not the raw rows', () => {
    const summary = summariseCumulative(
      classRows,
      's1',
      terms,
      'Primary',
    ).summary;

    // Maths 85, English 65 -> 75
    expect(summary.average).toBe(75);
    expect(summary.grade).toBe('B2');
    expect(summary.totalSubjects).toBe(2);
  });

  it('ranks the student against the whole class on cumulative average', () => {
    const first = summariseCumulative(classRows, 's2', terms).summary;
    const second = summariseCumulative(classRows, 's1', terms).summary;

    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
    expect(first.totalStudentsInClass).toBe(2);
  });

  it('gives tied cumulative averages the same position', () => {
    const tied = [
      row('s1', maths, 'First Term', 70),
      row('s1', maths, 'Second Term', 70),
      row('s2', maths, 'First Term', 70),
      row('s2', maths, 'Second Term', 70),
      row('s3', maths, 'First Term', 50),
      row('s3', maths, 'Second Term', 50),
    ];

    expect(summariseCumulative(tied, 's1', terms).summary.position).toBe(1);
    expect(summariseCumulative(tied, 's2', terms).summary.position).toBe(1);
    expect(summariseCumulative(tied, 's3', terms).summary.position).toBe(3);
  });

  it('weights the cumulative GPA by credit unit', () => {
    // Primary scale: Maths 85 (A1, 5.0, 3 credits), English 65 (B3, 3.5,
    // 2 credits): (5*3 + 3.5*2) / 5 = 4.4
    const summary = summariseCumulative(
      classRows,
      's1',
      terms,
      'Primary',
    ).summary;

    expect(summary.gpa).toBe(4.4);
    expect(summary.totalCredits).toBe(5);
  });

  it('returns null for a student with no rows in the window', () => {
    expect(summariseCumulative(classRows, 'unknown', terms)).toBeNull();
  });
});
