const {
  assignCompetitionRanks,
  getPrincipalComment,
} = require('../../src/services/gradingService');
const { calculateGrade } = require('../../src/models/Exam');
const { GRADE_SCALE } = require('../../src/config/constants');

/**
 * Grading is the highest-consequence pure logic in the system: these numbers
 * are printed on report cards, argued over by parents, and used for promotion
 * decisions. It has no external dependencies, so it is exhaustively testable.
 */

describe('calculateGrade', () => {
  // Every boundary in the Nigerian scale, from both sides.
  it.each([
    [100, 'A'],
    [70, 'A'],
    [69, 'B'],
    [60, 'B'],
    [59, 'C'],
    [50, 'C'],
    [49, 'D'],
    [45, 'D'],
    [44, 'E'],
    [40, 'E'],
    [39, 'F'],
    [0, 'F'],
  ])('scores %i as grade %s', (score, expected) => {
    expect(calculateGrade(score).grade).toBe(expected);
  });

  it.each([
    [85, 5.0],
    [65, 4.0],
    [55, 3.0],
    [47, 2.0],
    [42, 1.0],
    [10, 0.0],
  ])('gives %i a grade point of %f', (score, expected) => {
    expect(calculateGrade(score).gradePoint).toBe(expected);
  });

  it('falls back to the lowest band for out-of-range scores', () => {
    expect(calculateGrade(120).grade).toBe('F');
    expect(calculateGrade(-5).grade).toBe('F');
  });

  it('treats a missing score as zero rather than throwing', () => {
    expect(calculateGrade(undefined).grade).toBe('F');
    expect(calculateGrade(null).grade).toBe('F');
  });

  it('derives every band from GRADE_SCALE, with no second ladder', () => {
    // If someone reintroduces a hardcoded ladder, editing the config alone
    // will stop working — this catches that.
    GRADE_SCALE.forEach((band) => {
      const result = calculateGrade(band.min);
      expect(result.grade).toBe(band.grade);
      expect(result.remark).toBe(band.remark);
      expect(result.gradePoint).toBe(band.gradePoint);
    });
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
  it.each([
    [85, 'Excellent'],
    [65, 'Very good'],
    [55, 'Good'],
    [45, 'Fair'],
    [20, 'Poor'],
  ])('describes an average of %i as %s', (average, expected) => {
    expect(getPrincipalComment(average)).toContain(expected);
  });
});
