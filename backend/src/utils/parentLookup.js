const User = require('../models/User');

/**
 * Every parent account linked to a student.
 *
 * `studentProfile.parentId` holds one parent and a child can have two: linking
 * the second overwrites the field, while both keep the child in
 * `parentProfile.children` and so both can sign in and see the records. Emailing
 * `parentId` alone meant the parent linked first was never told about results or
 * certificates. The children list is the complete record; `parentId` is still
 * read for accounts linked from that side only.
 */
const parentsOfStudent = async (
  student,
  select = 'firstName lastName email',
) => {
  const parentId =
    student?.studentProfile?.parentId?._id || student?.studentProfile?.parentId;

  return User.find({
    role: 'Parent',
    isActive: { $ne: false },
    $or: [
      { 'parentProfile.children': student._id },
      ...(parentId ? [{ _id: parentId }] : []),
    ],
  }).select(select);
};

module.exports = { parentsOfStudent };
