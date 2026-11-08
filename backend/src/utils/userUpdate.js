/**
 * Turning a profile edit form into a database update.
 *
 * Used by every route that edits a person: the Students and Teachers pages
 * (PUT /users/:id) and the Parents page (PUT /parents/:id).
 */

// What an edit form may change. Everything else on a profile is kept by the
// flows that own it: the parent link (Parents page), class history
// (promotions), admission number and staff ID (generated on create).
const EDITABLE_TOP = ['firstName', 'lastName', 'phone'];
const EDITABLE_PROFILE = {
  studentProfile: [
    'class',
    'section',
    'gender',
    'dateOfBirth',
    'address',
    'bloodGroup',
    'medicalNotes',
    'profileStatus',
  ],
  teacherProfile: [
    'qualification',
    'specialization',
    'experience',
    'designation',
    'classTeacherOf',
    'subjectsTaught',
  ],
  parentProfile: ['occupation', 'relationship'],
};

// Names are required, so an empty one is ignored rather than cleared.
const REQUIRED = ['firstName', 'lastName'];

/**
 * The form's changes as a Mongo update, field by field.
 *
 * Passing the body straight to findByIdAndUpdate had two faults. A nested
 * object replaces the whole subdocument, so saving the student form wiped
 * every field it does not show: the linked parent, the class history, the
 * profile status. And a field left empty arrives as '', which is not a class
 * id, a gender or a date, so editing a teacher with no form class failed with
 * "'' is not a valid teacherProfile.classTeacherOf". Here each field is set by
 * its own path, and an empty one is cleared.
 */
const buildUserUpdate = (body) => {
  const $set = {};
  const $unset = {};

  const put = (path, value, field) => {
    if (value === undefined) return;
    if (value === '' || value === null) {
      if (!REQUIRED.includes(field)) $unset[path] = '';
      return;
    }
    $set[path] = value;
  };

  EDITABLE_TOP.forEach((field) => put(field, body[field], field));

  Object.entries(EDITABLE_PROFILE).forEach(([profile, fields]) => {
    const values = body[profile];
    if (!values || typeof values !== 'object') return;

    fields.forEach((field) => {
      let value = values[field];
      if (field === 'subjectsTaught' && Array.isArray(value)) {
        value = value.filter(Boolean);
      }
      put(`${profile}.${field}`, value, field);
    });
  });

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return update;
};

module.exports = { buildUserUpdate, EDITABLE_PROFILE };
