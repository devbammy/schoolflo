const {
  assignCompetitionRanks,
  getPrincipalComment,
} = require('../../src/services/gradingService');
const {
  calculateGrade,
  passMarkFor,
  gradeScaleFor,
} = require('../../src/models/Exam');
const {
  GRADE_SCALES,
  HEAD_COMMENTS,
  HEAD_COMMENT_LABELS,
} = require('../../src/config/constants');

/**
 * Grading is the highest-consequence pure logic in the system: these numbers
 * are printed on report cards, argued over by parents, and used for promotion
 * decisions. It has no external dependencies, so it is exhaustively testable.
 *
 * The school grades on two scales, both taken from its printed report cards:
 * the primary section (Pre-Nursery to Basic 5, class level 'Primary') and the
 * college (JSS 1 to SS 3).
 */

describe('the primary scale (Pre-Nursery to Basic 5)', () => {
  // Every boundary on the school's primary key, from both sides.
  it.each([
    [100, 'A1', 'Excellent'],
    [80, 'A1', 'Excellent'],
    [79.99, 'B2', 'Very Good'],
    [70, 'B2', 'Very Good'],
    [69.99, 'B3', 'Good'],
    [65, 'B3', 'Good'],
    [64.99, 'C4', 'Credit'],
    [60, 'C4', 'Credit'],
    [59.99, 'C5', 'Credit'],
    [55, 'C5', 'Credit'],
    [54.99, 'C6', 'Credit'],
    [50, 'C6', 'Credit'],
    [49.99, 'D7', 'Pass'],
    [45, 'D7', 'Pass'],
    [44.99, 'E8', 'Pass'],
    [40, 'E8', 'Pass'],
    [39.99, 'F9', 'Fail'],
    [0, 'F9', 'Fail'],
  ])('grades %f as %s (%s)', (score, grade, remark) => {
    expect(calculateGrade(score, 'Primary')).toMatchObject({ grade, remark });
  });

  // Figures from the school's own Pre-Nursery and Basic 1 sheets.
  it.each([
    [91, 'A1'],
    [70, 'B2'],
    [66, 'B3'],
    [54, 'C6'],
    [57, 'C5'],
    [89.38, 'A1'],
    [75.69, 'B2'],
  ])("matches the school's card: %f is %s", (score, grade) => {
    expect(calculateGrade(score, 'Primary').grade).toBe(grade);
  });
});

describe('the college scale (JSS 1 to SS 3)', () => {
  it.each([
    [100, 'A1', 'Distinction'],
    [90, 'A1', 'Distinction'],
    [89.99, 'B2', 'Distinction'],
    [80, 'B2', 'Distinction'],
    [79.99, 'B3', 'Distinction'],
    [75, 'B3', 'Distinction'],
    [74.99, 'C4', 'Credit'],
    [70, 'C4', 'Credit'],
    [69.99, 'C5', 'Credit'],
    [65, 'C5', 'Credit'],
    [64.99, 'C6', 'Credit'],
    [60, 'C6', 'Credit'],
    [59.99, 'D7', 'Pass'],
    [55, 'D7', 'Pass'],
    [54.99, 'E8', 'Pass'],
    [50, 'E8', 'Pass'],
    [49.99, 'F9', 'Fail'],
    [0, 'F9', 'Fail'],
  ])('grades %f as %s (%s)', (score, grade, remark) => {
    expect(calculateGrade(score, 'JSS')).toMatchObject({ grade, remark });
    expect(calculateGrade(score, 'SS')).toMatchObject({ grade, remark });
  });

  // Figures from the school's JS 1 Third Term sheet, termly and cumulative.
  it.each([
    [73, 'C4'],
    [82.6, 'B2'],
    [53.6, 'E8'],
    [56.6, 'D7'],
    [69.81, 'C5'],
    [71.4, 'C4'],
    [76.27, 'B3'],
    [55.37, 'D7'],
  ])("matches the school's card: %f is %s", (score, grade) => {
    expect(calculateGrade(score, 'JSS').grade).toBe(grade);
  });

  it('is used when no level is known, as the stricter of the two', () => {
    expect(calculateGrade(85).grade).toBe('B2');
  });
});

describe('calculateGrade', () => {
  it('grades the same total differently by level', () => {
    expect(calculateGrade(72, 'Primary').grade).toBe('B2');
    expect(calculateGrade(72, 'JSS').grade).toBe('C4');
  });

  it('falls back to the lowest band for out-of-range scores', () => {
    expect(calculateGrade(120, 'Primary').grade).toBe('F9');
    expect(calculateGrade(-5, 'JSS').grade).toBe('F9');
  });

  it('treats a missing score as zero rather than throwing', () => {
    expect(calculateGrade(undefined, 'Primary').grade).toBe('F9');
    expect(calculateGrade(null, 'JSS').grade).toBe('F9');
  });

  it('derives every band from GRADE_SCALES, with no second ladder', () => {
    // If someone reintroduces a hardcoded ladder, editing the config alone
    // will stop working — this catches that.
    [
      ['Primary', GRADE_SCALES.primary],
      ['JSS', GRADE_SCALES.college],
    ].forEach(([level, scale]) => {
      expect(gradeScaleFor(level)).toBe(scale);
      scale.forEach((band) => {
        expect(calculateGrade(band.min, level)).toMatchObject({
          grade: band.grade,
          remark: band.remark,
          gradePoint: band.gradePoint,
        });
      });
    });
  });

  it('gives each scale its own pass mark', () => {
    expect(passMarkFor('Primary')).toBe(40);
    expect(passMarkFor('JSS')).toBe(50);
    expect(passMarkFor('SS')).toBe(50);
  });
});

describe('assignCompetitionRanks', () => {
  // Rank a list of raw scores, returning positions in the original order.
  const rank = (scores) => {
    const items = scores.map((score, index) => ({ score, index }));
    const sorted = [...items].sort((a, b) => b.score - a.score);
    const positions = assignCompetitionRanks(sorted, (item) => item.score);
    return items.map((item) => positions.get(item));
  };

  it('ranks distinct scores sequentially', () => {
    expect(rank([90, 80, 70])).toEqual([1, 2, 3]);
  });

  it('gives tied students the same position and skips the next', () => {
    // The whole point: two identical performances must not get 1st and 2nd.
    expect(rank([82, 82, 79])).toEqual([1, 1, 3]);
  });

  it('handles a tie in the middle', () => {
    expect(rank([90, 80, 80, 70])).toEqual([1, 2, 2, 4]);
  });

  it('handles every score being identical', () => {
    expect(rank([75, 75, 75])).toEqual([1, 1, 1]);
  });

  it('handles a tie at the bottom', () => {
    expect(rank([90, 60, 60])).toEqual([1, 2, 2]);
  });

  it('handles an empty list', () => {
    expect(rank([])).toEqual([]);
  });

  it('handles a single entry', () => {
    expect(rank([50])).toEqual([1]);
  });

  it('never awards a position beyond the cohort size', () => {
    const positions = rank([70, 70, 70, 70, 70]);
    positions.forEach((p) => expect(p).toBeLessThanOrEqual(5));
  });
});

describe('credit-weighted GPA arithmetic', () => {
  // Mirrors the reduction inside generateReportCard.
  const gpa = (rows) => {
    const { weighted, credits } = rows.reduce(
      (acc, r) => ({
        weighted: acc.weighted + r.gradePoint * r.creditUnit,
        credits: acc.credits + r.creditUnit,
      }),
      { weighted: 0, credits: 0 },
    );
    return credits > 0 ? parseFloat((weighted / credits).toFixed(2)) : 0;
  };

  it('weights a heavier subject more', () => {
    // 3-credit A (5.0) with a 1-credit F (0.0) => 15/4 = 3.75,
    // not the unweighted mean of 2.5.
    expect(
      gpa([
        { gradePoint: 5, creditUnit: 3 },
        { gradePoint: 0, creditUnit: 1 },
      ]),
    ).toBe(3.75);
  });

  it('matches a flat mean when all credits are equal', () => {
    expect(
      gpa([
        { gradePoint: 5, creditUnit: 1 },
        { gradePoint: 0, creditUnit: 1 },
      ]),
    ).toBe(2.5);
  });

  it('returns zero rather than NaN when there are no credits', () => {
    expect(gpa([])).toBe(0);
  });
});

describe('getPrincipalComment', () => {
  // The school's own wordings, from its cards.
  it.each([
    [89.38, 'Primary', 'AN EXCELLENT RESULT, KEEP IT UP'],
    [75.69, 'Primary', 'VERY GOOD RESULT, YOU CAN DO BETTER THAN THIS'],
    [69.81, 'JSS', 'GOOD RESULT, THERE IS ROOM FOR IMPROVEMENT'],
  ])('comments on %f (%s) as the school does', (average, level, comment) => {
    expect(getPrincipalComment(average, level)).toBe(comment);
  });

  it('has a comment for every grade on both scales', () => {
    [...GRADE_SCALES.primary, ...GRADE_SCALES.college].forEach((band) => {
      expect(HEAD_COMMENTS[band.grade]).toEqual(expect.any(String));
    });
  });

  it('is signed by the head teacher in primary and the head of school in college', () => {
    expect(HEAD_COMMENT_LABELS.primary).toMatch(/HEAD TEACHER/);
    expect(HEAD_COMMENT_LABELS.college).toMatch(/HEAD OF SCHOOL/);
  });
});
