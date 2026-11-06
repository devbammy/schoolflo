/**
 * A score's grade, from the school's own scale.
 *
 * The scale comes from the server (`GET /config` → `gradeScale`), which reads
 * GRADE_SCALE in the backend's config/constants.js. The two score-entry pages
 * used to carry their own copies of the ladder, so a school that changed a
 * boundary saw one grade while typing and another on the report card.
 *
 * Matched on `min` alone, highest band first, exactly as the server's
 * calculateGrade does: the bands are whole numbers, and testing `<= max` left
 * 69.5 matching nothing.
 */
export const gradeFor = (score, scale) => {
  if (!Array.isArray(scale) || scale.length === 0) return '—';

  const value = Number(score) || 0;
  const bands = [...scale].sort((a, b) => b.min - a.min);
  const band = bands.find((b) => value >= b.min) || bands[bands.length - 1];
  return band.grade;
};

/**
 * Whether a score row should be saved.
 *
 * Only a student someone has entered a score for, or who already has a result.
 * Saving the whole class used to file a 0 for every student left blank, so a
 * student who does not take an optional subject got an F in it on their report
 * card, and it dragged their average and position down.
 */
export const hasScoreEntry = (entry) =>
  Boolean(entry) && Object.values(entry).some((v) => v !== undefined && v !== '');
