/**
 * Utility functions for academic year handling
 * Standardizes academic year format to YYYY/YYYY (e.g., 2024/2025)
 */

/**
 * Get the current academic year in YYYY/YYYY format
 * @returns {string} Current academic year (e.g., "2024/2025")
 */
export const getCurrentAcademicYear = () => {
  const now = new Date();
  const currentYear = now.getFullYear();
  // If we're in Jan-Aug, we're in the previous year's academic year
  // If we're in Sept-Dec, we're in the current year's academic year
  const startYear = now.getMonth() < 8 ? currentYear - 1 : currentYear;
  return `${startYear}/${startYear + 1}`;
};

/**
 * Generate academic year options for a dropdown
 * @param {number} yearsBack - How many years back to include (default: 5)
 * @returns {string[]} Array of academic years
 */
export const generateAcademicYearOptions = (yearsBack = 5) => {
  const currentYear = new Date().getFullYear();
  const years = [];
  for (let i = 0; i < yearsBack; i++) {
    const startYear = currentYear - i;
    years.push(`${startYear - 1}/${startYear}`);
  }
  return years;
};

/**
 * Validate academic year format
 * @param {string} academicYear - Academic year to validate
 * @returns {boolean} True if valid YYYY/YYYY format
 */
export const isValidAcademicYear = (academicYear) => {
  return /^\d{4}\/\d{4}$/.test(academicYear);
};

/**
 * Parse academic year string to get start and end years
 * @param {string} academicYear - Academic year string (e.g., "2024/2025")
 * @returns {object} Object with startYear and endYear
 */
export const parseAcademicYear = (academicYear) => {
  const [startYear, endYear] = academicYear.split('/').map(Number);
  return { startYear, endYear };
};
