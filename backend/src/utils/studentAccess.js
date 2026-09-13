const AppError = require('./AppError');

/**
 * Who may see a given student's records.
 *
 * This is the one definition of "own data" for anything filed against a
 * student — results, attendance, certificates, CA tracking. It was previously
 * written out by hand in each controller that remembered to, which is exactly
 * why two domains ended up with no check at all: `certificateController` and
 * `caTrackingController` both served any student's records to any signed-in
 * account, so a parent could read another family's leaving certificate by
 * asking for it.
 *
 * Mirrors `utils/teacherScope.js`: one place to read, one place to change.
 *
 * Staff are deliberately unrestricted here. A teacher's narrower scope is a
 * separate question with its own answer — see `teacherScope` — and conflating
 * the two would either break a form teacher's dashboard or silently widen a
 * parent's.
 */

const STAFF = ['Admin', 'Teacher'];

/**
 * The children a parent account is responsible for, as strings.
 *
 * `protect` loads the user without populating, so this is a list of ObjectIds;
 * it is also correct when something upstream has populated them into
 * documents, because a populated child still stringifies to its id.
 */
const childIdsOf = (user) =>
  (user.parentProfile?.children || []).map((child) =>
    String(child?._id || child),
  );

/**
 * Returns an explanatory message, or null when the request is permitted.
 *
 * `subject` names the thing being read so the refusal can say what was
 * refused — "your own results" reads better than "this resource".
 */
const checkStudentAccess = (user, studentId, subject = 'records') => {
  if (!user) return 'Authentication required.';
  if (STAFF.includes(user.role)) return null;

  if (user.role === 'Student') {
    return String(user._id) === String(studentId)
      ? null
      : `You can only view your own ${subject}.`;
  }

  if (user.role === 'Parent') {
    return childIdsOf(user).includes(String(studentId))
      ? null
      : `You can only view your own children's ${subject}.`;
  }

  return 'Access denied.';
};

/** Throwing form, for a controller that reads one student's records. */
const assertStudentAccess = (user, studentId, subject = 'records') => {
  const denied = checkStudentAccess(user, studentId, subject);
  if (denied) throw AppError.forbidden(denied);
};

/**
 * The students this account may see, for filtering a LIST rather than
 * checking one id.
 *
 * Returns `null` for staff, meaning no restriction — distinct from `[]`, which
 * means a parent with no children linked and must return nothing. Collapsing
 * those two into an empty array would show a childless parent the whole
 * school.
 */
const visibleStudentIds = (user) => {
  if (!user) return [];
  if (STAFF.includes(user.role)) return null;
  if (user.role === 'Student') return [String(user._id)];
  if (user.role === 'Parent') return childIdsOf(user);
  return [];
};

/**
 * Narrow a Mongoose query object in place to the students this account may
 * see. Pass the field the student id lives on — it is `student` on most
 * models but not all.
 *
 * Honours a caller-supplied filter on the same field: an admin filtering by
 * one student keeps that filter, and a parent who asks for a child that is
 * not theirs gets an impossible intersection rather than a wider result.
 */
const scopeQueryToStudents = (query, user, field = 'student') => {
  const allowed = visibleStudentIds(user);
  if (allowed === null) return query;

  const requested = query[field];

  if (requested) {
    const requestedId = String(requested);
    query[field] = allowed.includes(requestedId) ? requestedId : { $in: [] }; // asked for someone else's — return nothing
    return query;
  }

  query[field] = { $in: allowed };
  return query;
};

module.exports = {
  checkStudentAccess,
  assertStudentAccess,
  visibleStudentIds,
  scopeQueryToStudents,
  childIdsOf,
};
