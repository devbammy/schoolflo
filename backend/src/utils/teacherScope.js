const Class = require('../models/Class');
const Subject = require('../models/Subject');
const AppError = require('../utils/AppError');

/**
 * Which classes a teacher is responsible for.
 *
 * Two things make a class theirs: being its form teacher
 * (`teacherProfile.classTeacherOf`) or being the class teacher of one of its
 * sections. Both are checked, because a school that runs sections sets the
 * second and leaves the first empty.
 *
 * This is the single definition of a teacher's scope. It was previously
 * implicit — the attendance page listed every class in the school and let a
 * teacher mark a register for any of them.
 */
const getTeacherClassIds = async (user) => {
  const own = user.teacherProfile?.classTeacherOf;

  const sectionClasses = await Class.find({
    'sections.classTeacher': user._id,
  }).select('_id');

  const ids = sectionClasses.map((c) => String(c._id));
  if (own) ids.push(String(own));

  return [...new Set(ids)];
};

/** The class documents themselves, for a picker. */
const getTeacherClasses = async (user) => {
  const own = user.teacherProfile?.classTeacherOf;

  return Class.find({
    isActive: true,
    $or: [
      { 'sections.classTeacher': user._id },
      ...(own ? [{ _id: own }] : []),
    ],
  })
    .select('name level academicYear sections')
    .sort({ name: 1 });
};

/**
 * Classes whose students a teacher may see.
 *
 * Deliberately wider than `getTeacherClassIds`. That one answers "may this
 * teacher act on this class" — mark its register, run its report — and a
 * subject teacher has no business doing either. But a subject teacher does
 * need the roster of every class their subject is offered in, or they cannot
 * enter a grade for it. Reading a roster and owning a class are two different
 * permissions, and conflating them either breaks grade entry or hands the
 * register to someone who teaches one period a week.
 */
const getTeacherRosterClassIds = async (user) => {
  const owned = await getTeacherClassIds(user);
  const taught = (user.teacherProfile?.subjectsTaught || []).map(String);

  const subjects = await Subject.find({
    $or: [
      ...(taught.length ? [{ _id: { $in: taught } }] : []),
      { teachers: user._id },
    ],
  }).select('classes');

  const ids = new Set(owned);
  subjects.forEach((subject) =>
    (subject.classes || []).forEach((c) => ids.add(String(c))),
  );

  return [...ids];
};

/**
 * Throw unless this user may act on the class. Admins may act on any.
 */
const assertClassAccess = async (user, classId) => {
  if (user.role === 'Admin') return;

  const ids = await getTeacherClassIds(user);

  if (!ids.includes(String(classId))) {
    throw AppError.forbidden(
      'You can only do this for a class you are assigned to.',
    );
  }
};

/**
 * Throw unless this user may see the students of this class.
 */
const assertRosterAccess = async (user, classId) => {
  if (user.role === 'Admin') return;

  const ids = await getTeacherRosterClassIds(user);

  if (!ids.includes(String(classId))) {
    throw AppError.forbidden(
      'You can only view students in a class you teach.',
    );
  }
};

module.exports = {
  getTeacherClassIds,
  getTeacherRosterClassIds,
  getTeacherClasses,
  assertClassAccess,
  assertRosterAccess,
};
