const User = require('../models/User');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Announcement = require('../models/Announcement');
const { Assignment } = require('../models/Assignment');
const { Book } = require('../models/Library');
const Task = require('../models/Task');
const { getTeacherClassIds } = require('../utils/teacherScope');
const { emailMatches } = require('../utils/mailbox');

/**
 * One search box for the whole portal.
 *
 * Two rules shape everything below.
 *
 *   1. A search result is a permission decision. The scope for each role is
 *      built here, once, rather than being left to whichever page happens to
 *      render the hit — a parent typing a surname must not learn that another
 *      family exists, and a student must not find an unpublished assignment.
 *   2. Results carry the URL that opens them, resolved per role, so the client
 *      does not have to re-derive a route from a record type.
 */

// A user-supplied pattern is data, not syntax. Without this, `.*` scans every
// collection and `(((` throws.
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Every group the search can return, and who may see each one.
const GROUP_ROLES = {
  students: ['Admin', 'Teacher'],
  teachers: ['Admin'],
  parents: ['Admin'],
  classes: ['Admin', 'Teacher'],
  subjects: ['Admin', 'Teacher', 'Student', 'Parent'],
  assignments: ['Admin', 'Teacher', 'Student', 'Parent'],
  announcements: ['Admin', 'Teacher', 'Student', 'Parent'],
  books: ['Admin', 'Teacher', 'Student', 'Parent'],
  tasks: ['Admin', 'Teacher'],
  children: ['Parent'],
};

const ROLE_HOME = {
  Admin: '/admin',
  Teacher: '/teacher',
  Student: '/student',
  Parent: '/parent',
};

const MIN_QUERY_LENGTH = 2;

// ─── Per-group searches ──────────────────────────────────────────────────────
// Each returns a plain array in the shape the client renders:
// { type, id, title, subtitle, meta, url }.

const searchStudents = async (pattern, { user, limit }) => {
  const filter = {
    role: 'Student',
    $or: [
      { firstName: pattern },
      { lastName: pattern },
      emailMatches(pattern),
      { 'studentProfile.admissionNumber': pattern },
    ],
  };

  // A teacher searches within their own classes. An admin searches the school.
  if (user.role === 'Teacher') {
    const ids = await getTeacherClassIds(user);
    if (!ids.length) return [];
    filter['studentProfile.class'] = { $in: ids };
  }

  const students = await User.find(filter)
    .select(
      'firstName lastName email avatar studentProfile.admissionNumber studentProfile.class',
    )
    .populate('studentProfile.class', 'name')
    .limit(limit)
    .lean();

  return students.map((s) => ({
    type: 'student',
    id: String(s._id),
    title: `${s.firstName} ${s.lastName}`,
    subtitle: s.studentProfile?.admissionNumber || s.email,
    meta: s.studentProfile?.class?.name || 'No class',
    avatar: s.avatar?.url || '',
    url:
      user.role === 'Admin'
        ? `/admin/students?student=${s._id}`
        : `/teacher/grades?student=${s._id}`,
  }));
};

const searchChildren = async (pattern, { user, limit }) => {
  const childIds = user.parentProfile?.children || [];
  if (!childIds.length) return [];

  const children = await User.find({
    _id: { $in: childIds },
    $or: [
      { firstName: pattern },
      { lastName: pattern },
      { 'studentProfile.admissionNumber': pattern },
    ],
  })
    .select(
      'firstName lastName avatar studentProfile.admissionNumber studentProfile.class',
    )
    .populate('studentProfile.class', 'name')
    .limit(limit)
    .lean();

  return children.map((c) => ({
    type: 'child',
    id: String(c._id),
    title: `${c.firstName} ${c.lastName}`,
    subtitle: c.studentProfile?.admissionNumber || '',
    meta: c.studentProfile?.class?.name || 'No class',
    avatar: c.avatar?.url || '',
    url: `/parent/results?child=${c._id}`,
  }));
};

const searchTeachers = async (pattern, { limit }) => {
  const teachers = await User.find({
    role: 'Teacher',
    $or: [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { 'teacherProfile.staffId': pattern },
    ],
  })
    .select(
      'firstName lastName email avatar teacherProfile.staffId teacherProfile.designation',
    )
    .limit(limit)
    .lean();

  return teachers.map((t) => ({
    type: 'teacher',
    id: String(t._id),
    title: `${t.firstName} ${t.lastName}`,
    subtitle: t.teacherProfile?.staffId || t.email,
    meta: t.teacherProfile?.designation || 'Teacher',
    avatar: t.avatar?.url || '',
    url: `/admin/teachers?teacher=${t._id}`,
  }));
};

const searchParents = async (pattern, { limit }) => {
  const parents = await User.find({
    role: 'Parent',
    $or: [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { phone: pattern },
    ],
  })
    .select('firstName lastName email phone avatar parentProfile.children')
    .limit(limit)
    .lean();

  return parents.map((p) => ({
    type: 'parent',
    id: String(p._id),
    title: `${p.firstName} ${p.lastName}`,
    subtitle: p.email,
    meta: `${p.parentProfile?.children?.length || 0} child(ren)`,
    avatar: p.avatar?.url || '',
    url: `/admin/parents?parent=${p._id}`,
  }));
};

const searchClasses = async (pattern, { user, limit }) => {
  const filter = { name: pattern, isActive: true };

  if (user.role === 'Teacher') {
    const ids = await getTeacherClassIds(user);
    if (!ids.length) return [];
    filter._id = { $in: ids };
  }

  const classes = await Class.find(filter)
    .select('name level academicYear sections')
    .limit(limit)
    .lean();

  return classes.map((c) => ({
    type: 'class',
    id: String(c._id),
    title: c.name,
    subtitle: `${c.level} · ${c.academicYear}`,
    meta: `${c.sections?.length || 0} section(s)`,
    url:
      user.role === 'Admin'
        ? `/admin/classes?class=${c._id}`
        : `/teacher/attendance?class=${c._id}`,
  }));
};

const searchSubjects = async (pattern, { user, limit }) => {
  const subjects = await Subject.find({
    $or: [{ name: pattern }, { code: pattern }],
    isActive: { $ne: false },
  })
    .select('name code isCore')
    .limit(limit)
    .lean();

  return subjects.map((s) => ({
    type: 'subject',
    id: String(s._id),
    title: s.name,
    subtitle: s.code,
    meta: s.isCore ? 'Core' : 'Elective',
    url: user.role === 'Admin' ? `/admin/subjects?subject=${s._id}` : '',
  }));
};

const searchAssignments = async (pattern, { user, limit }) => {
  const filter = {
    $or: [{ title: pattern }, { description: pattern }],
    isActive: true,
  };

  if (user.role === 'Teacher') {
    filter.teacher = user._id;
  } else if (user.role === 'Student') {
    // A draft belongs to the teacher who is still writing it.
    filter.isPublished = true;
    filter.class = user.studentProfile?.class;
    if (!filter.class) return [];
  } else if (user.role === 'Parent') {
    const children = await User.find({
      _id: { $in: user.parentProfile?.children || [] },
    })
      .select('studentProfile.class')
      .lean();

    const classIds = children
      .map((c) => c.studentProfile?.class)
      .filter(Boolean);

    if (!classIds.length) return [];

    filter.isPublished = true;
    filter.class = { $in: classIds };
  }

  const assignments = await Assignment.find(filter)
    .select('title dueDate class subject isPublished')
    .populate('class', 'name')
    .populate('subject', 'name')
    .sort({ dueDate: -1 })
    .limit(limit)
    .lean();

  const home = ROLE_HOME[user.role];

  return assignments.map((a) => ({
    type: 'assignment',
    id: String(a._id),
    title: a.title,
    subtitle: `${a.subject?.name || 'Subject'} · ${a.class?.name || 'Class'}`,
    meta: a.dueDate
      ? `Due ${new Date(a.dueDate).toLocaleDateString('en-GB')}`
      : '',
    url: `${home}/assignments?assignment=${a._id}`,
  }));
};

const searchAnnouncements = async (pattern, { user, limit }) => {
  const filter = { $or: [{ title: pattern }, { body: pattern }] };

  if (user.role !== 'Admin') {
    filter.isPublished = true;
    filter.targetAudience = { $in: ['All', user.role] };
  }

  const announcements = await Announcement.find(filter)
    .select('title body priority createdAt publishedAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  const home = ROLE_HOME[user.role];

  return announcements.map((a) => ({
    type: 'announcement',
    id: String(a._id),
    title: a.title,
    subtitle: (a.body || '').replace(/\s+/g, ' ').slice(0, 90),
    meta: a.priority || 'Normal',
    url: `${home}/announcements?announcement=${a._id}`,
  }));
};

const searchBooks = async (pattern, { user, limit }) => {
  const books = await Book.find({
    isActive: true,
    $or: [
      { title: pattern },
      { author: pattern },
      { isbn: pattern },
      { category: pattern },
    ],
  })
    .select('title author category availableCopies totalCopies')
    .limit(limit)
    .lean();

  const base = `${ROLE_HOME[user.role]}/library`;

  return books.map((b) => ({
    type: 'book',
    id: String(b._id),
    title: b.title,
    subtitle: b.author,
    meta: `${b.availableCopies}/${b.totalCopies} available`,
    url: `${base}?book=${b._id}`,
  }));
};

const searchTasks = async (pattern, { user, limit }) => {
  const filter = { $or: [{ title: pattern }, { description: pattern }] };

  if (user.role === 'Teacher') filter.assignedTo = user._id;

  const tasks = await Task.find(filter)
    .select('title status dueDate assignedTo priority')
    .populate('assignedTo', 'firstName lastName')
    .sort({ dueDate: 1 })
    .limit(limit)
    .lean();

  return tasks.map((t) => ({
    type: 'task',
    id: String(t._id),
    title: t.title,
    subtitle:
      user.role === 'Admin'
        ? `${t.assignedTo?.firstName || ''} ${t.assignedTo?.lastName || ''}`.trim()
        : t.priority,
    meta: t.status,
    url: `${ROLE_HOME[user.role]}/tasks?task=${t._id}`,
  }));
};

const SEARCHERS = {
  students: searchStudents,
  children: searchChildren,
  teachers: searchTeachers,
  parents: searchParents,
  classes: searchClasses,
  subjects: searchSubjects,
  assignments: searchAssignments,
  announcements: searchAnnouncements,
  books: searchBooks,
  tasks: searchTasks,
};

/** Which groups this user is allowed to search at all. */
const groupsForRole = (role) =>
  Object.keys(GROUP_ROLES).filter((group) => GROUP_ROLES[group].includes(role));

/**
 * Run the search.
 *
 * @param {object}   options
 * @param {object}   options.user    the signed-in user
 * @param {string}   options.query   raw text from the search box
 * @param {string[]} [options.types] restrict to these groups
 * @param {number}   [options.limit] hits per group
 */
const search = async ({ user, query, types, limit = 5 }) => {
  const trimmed = String(query || '').trim();

  if (trimmed.length < MIN_QUERY_LENGTH) {
    return { query: trimmed, total: 0, groups: {} };
  }

  const pattern = new RegExp(escapeRegex(trimmed), 'i');

  const allowed = groupsForRole(user.role);
  const wanted = types?.length
    ? allowed.filter((group) => types.includes(group))
    : allowed;

  // One round trip per group, all in flight together. A failure in one group
  // must not blank the whole search — an empty section is better than an error
  // toast over an otherwise working result list.
  const settled = await Promise.allSettled(
    wanted.map((group) => SEARCHERS[group](pattern, { user, limit })),
  );

  const groups = {};
  let total = 0;

  wanted.forEach((group, index) => {
    const outcome = settled[index];

    if (outcome.status === 'rejected') {
      console.error(
        `Search group '${group}' failed: ${outcome.reason?.message}`,
      );
      return;
    }

    if (outcome.value.length) {
      groups[group] = outcome.value;
      total += outcome.value.length;
    }
  });

  return { query: trimmed, total, groups };
};

module.exports = { search, groupsForRole, escapeRegex, MIN_QUERY_LENGTH };
