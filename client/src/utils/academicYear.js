// src/utils/academicYear.js

/**
 * Academic Year Utilities
 * Format: YYYY/YYYY
 * Example: 2025/2026
 */

/**
 * Returns the academic year based on today's date.
 * Assumes academic session starts in September.
 */
export const getCurrentAcademicYear = (startMonth = 8, offset = 0) => {
  const now = new Date();
  const currentYear = now.getFullYear();

  const baseStartYear =
    now.getMonth() >= startMonth ? currentYear : currentYear - 1;

  const startYear = baseStartYear + offset;

  return `${startYear}/${startYear + 1}`;
};

/**
 * Generate academic year options.
 *
 * @param {Object} options
 * @param {number} options.count - Number of years
 * @param {boolean} options.includeFuture - Include future sessions
 * @param {number} options.futureCount - Number of future sessions
 * @returns {string[]}
 */
export const generateAcademicYearOptions = ({
  count = 5,
  includeFuture = false,
  futureCount = 1,
} = {}) => {
  const current = getCurrentAcademicYear();

  const currentStartYear = parseAcademicYear(current).startYear;

  const years = [];

  // Previous/current years
  for (let i = 0; i < count; i++) {
    const year = currentStartYear - i;
    years.push(`${year}/${year + 1}`);
  }

  // Future years
  if (includeFuture) {
    for (let i = 1; i <= futureCount; i++) {
      const year = currentStartYear + i;
      years.unshift(`${year}/${year + 1}`);
    }
  }

  return years;
};

/**
 * Validate academic year format and logical sequence.
 */
export const isValidAcademicYear = (academicYear) => {
  if (!/^\d{4}\/\d{4}$/.test(academicYear)) {
    return false;
  }

  const { startYear, endYear } = parseAcademicYear(academicYear);

  return endYear === startYear + 1;
};

/**
 * Parse academic year string.
 */
export const parseAcademicYear = (academicYear) => {
  const [startYear, endYear] = academicYear.split('/').map(Number);

  return {
    startYear,
    endYear,
  };
};

/**
 * Get next academic year.
 */
export const getNextAcademicYear = (academicYear) => {
  const { startYear } = parseAcademicYear(academicYear);

  return `${startYear + 1}/${startYear + 2}`;
};

/**
 * Get previous academic year.
 */
export const getPreviousAcademicYear = (academicYear) => {
  const { startYear } = parseAcademicYear(academicYear);

  return `${startYear - 1}/${startYear}`;
};

/**
 * Compare academic years.
 * Useful for sorting.
 */
export const compareAcademicYears = (a, b) => {
  const yearA = parseAcademicYear(a).startYear;
  const yearB = parseAcademicYear(b).startYear;

  return yearB - yearA;
};
