const User = require('../models/User');
const Session = require('../models/Session');
const { Assignment, Submission } = require('../models/Assignment');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const { clientUrl } = require('../config/clientUrl');
const AppError = require('../utils/AppError');
const { applySort } = require('../utils/listSort');
const { emailTemplates } = require('../services/notificationService');
const { enqueueEmail } = require('../services/jobQueue');
const audit = require('../services/auditService');
const { buildUserUpdate } = require('../utils/userUpdate');

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CHILD_POPULATE = {
  path: 'parentProfile.children',
  select: 'firstName lastName studentProfile avatar',
  populate: { path: 'studentProfile.class', select: 'name level' },
};

// @desc    List parents with their linked children
// @route   GET /api/v1/parents
// @access  Admin
const getParents = async (req, res) => {
  const { search } = req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = { role: 'Parent' };

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { phone: pattern },
    ];
  }

  const [parents, total] = await Promise.all([
    applySort(User.find(filter), req.query.sort, ['firstName', 'lastName'])
      .populate(CHILD_POPULATE)
      .select('-password')
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return sendPaginated(res, parents, total, page, limit);
};

// @desc    Create a parent account and link their children
// @route   POST /api/v1/parents
// @access  Admin
const createParent = async (req, res) => {
  const {
    firstName,
    lastName,
    email,
    password,
    phone,
    parentProfile,
    childrenIds = [],
  } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw AppError.conflict('Email already registered');

  // Linking is what grants access to a child's records, so every id must really
  // be a student. Nothing checked, and a wrong id wrote a parent link onto
  // whichever account it happened to match.
  if (childrenIds.length) {
    const found = await User.countDocuments({
      _id: { $in: childrenIds },
      role: 'Student',
    });
    if (found !== new Set(childrenIds.map(String)).size) {
      throw AppError.badRequest('One or more children could not be found.');
    }
  }

  const parent = await User.create({
    firstName,
    lastName,
    email,
    password,
    phone,
    role: 'Parent',
    parentProfile: {
      occupation: parentProfile?.occupation || '',
      relationship: parentProfile?.relationship || 'Guardian',
      children: childrenIds,
    },
  });

  // Keep both sides of the relationship in step.
  if (childrenIds.length) {
    await User.updateMany(
      { _id: { $in: childrenIds } },
      { $set: { 'studentProfile.parentId': parent._id } },
    );
  }

  // Welcome email with the credentials the admin just set. Never allowed to
  // fail the request — the account exists either way.
  enqueueEmail({
    to: parent.email,
    subject: 'Your parent account is ready',
    html: emailTemplates.welcome({
      firstName: parent.firstName,
      email: parent.email,
      password,
      role: 'Parent',
      loginUrl: `${clientUrl()}/login`,
    }),
  }).catch((err) =>
    console.error(
      `Parent welcome email failed for ${parent.email}: ${err.message}`,
    ),
  );

  await audit.record(req, {
    action: 'user.create',
    entity: 'User',
    entityId: parent._id,
    entityLabel: `${parent.firstName} ${parent.lastName}`,
    meta: {
      email: parent.email,
      role: 'Parent',
      children: childrenIds.map(String),
    },
  });

  await parent.populate({
    path: 'parentProfile.children',
    select: 'firstName lastName studentProfile',
  });

  parent.password = undefined;

  return sendSuccess(res, 201, 'Parent account created', { parent });
};

// @desc    Update a parent profile
// @route   PUT /api/v1/parents/:id
// @access  Admin
const updateParent = async (req, res) => {
  const { password, email, role, ...updateData } = req.body;

  // Matched on role as well as id: this route is for parents, and without the
  // role it would edit any account — a teacher, an admin — handed to it.
  // Field by field, through the same helper as students and teachers. The
  // form sends only occupation and relationship, and passing it whole replaced
  // the entire parentProfile, children list included: editing a parent's phone
  // number unlinked every child they had.
  const parent = await User.findOneAndUpdate(
    { _id: req.params.id, role: 'Parent' },
    buildUserUpdate(updateData),
    {
      new: true,
      runValidators: true,
    },
  )
    .populate({
      path: 'parentProfile.children',
      select: 'firstName lastName studentProfile avatar',
    })
    .select('-password');

  if (!parent) throw AppError.notFound('Parent not found');

  return sendSuccess(res, 200, 'Parent updated', { parent });
};

// @desc    Link or unlink a child
// @route   PATCH /api/v1/parents/:id/children
// @access  Admin
const linkChild = async (req, res) => {
  const { action, childId } = req.body;

  const parent = await User.findById(req.params.id);
  if (!parent || parent.role !== 'Parent') {
    throw AppError.notFound('Parent not found');
  }

  const child = await User.findById(childId);
  if (!child || child.role !== 'Student') {
    throw AppError.notFound('Student not found');
  }

  if (!parent.parentProfile) parent.parentProfile = { children: [] };
  if (!Array.isArray(parent.parentProfile.children)) {
    parent.parentProfile.children = [];
  }

  if (action === 'link') {
    const alreadyLinked = parent.parentProfile.children.some(
      (id) => String(id) === String(childId),
    );
    if (!alreadyLinked) parent.parentProfile.children.push(childId);

    child.studentProfile.parentId = parent._id;
    await child.save({ validateBeforeSave: false });
  } else {
    parent.parentProfile.children = parent.parentProfile.children.filter(
      (id) => String(id) !== String(childId),
    );

    if (String(child.studentProfile?.parentId) === String(parent._id)) {
      // Fall back to another linked parent rather than blank the field: the
      // child still has one, and would otherwise be listed as having none.
      const other = await User.findOne({
        _id: { $ne: parent._id },
        role: 'Parent',
        'parentProfile.children': child._id,
      }).select('_id');

      child.studentProfile.parentId = other?._id;
      await child.save({ validateBeforeSave: false });
    }
  }

  await parent.save({ validateBeforeSave: false });

  // A link is a permission: it decides who can read this child's results,
  // attendance and fees, so it has to be possible to say who granted it.
  await audit.record(req, {
    action: action === 'link' ? 'parent.link_child' : 'parent.unlink_child',
    entity: 'User',
    entityId: parent._id,
    entityLabel: `${parent.firstName} ${parent.lastName}`,
    subject: child._id,
    meta: { parentEmail: parent.email },
  });

  await parent.populate({
    path: 'parentProfile.children',
    select: 'firstName lastName studentProfile avatar',
  });

  return sendSuccess(res, 200, `Child ${action}ed successfully`, {
    children: parent.parentProfile.children,
  });
};

// @desc    Delete a parent account
// @route   DELETE /api/v1/parents/:id
// @access  Admin
const deleteParent = async (req, res) => {
  const parent = await User.findById(req.params.id);
  if (!parent || parent.role !== 'Parent') {
    throw AppError.notFound('Parent not found');
  }

  // Detach the children before removing the account.
  await User.updateMany(
    { 'studentProfile.parentId': parent._id },
    { $unset: { 'studentProfile.parentId': '' } },
  );

  await Session.deleteMany({ user: parent._id });
  await parent.deleteOne();

  await audit.record(req, {
    action: 'user.delete',
    entity: 'User',
    entityId: parent._id,
    entityLabel: `${parent.firstName} ${parent.lastName}`,
    meta: { email: parent.email, role: 'Parent' },
  });

  return sendSuccess(res, 200, 'Parent account deleted');
};

// @desc    Students with no parent linked
// @route   GET /api/v1/parents/students/unlinked
// @access  Admin
const getUnlinkedStudents = async (req, res) => {
  const { search } = req.query;

  const filter = {
    role: 'Student',
    $or: [
      { 'studentProfile.parentId': { $exists: false } },
      { 'studentProfile.parentId': null },
    ],
  };

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$and = [
      {
        $or: [
          { firstName: pattern },
          { lastName: pattern },
          { 'studentProfile.admissionNumber': pattern },
        ],
      },
    ];
  }

  const students = await User.find(filter)
    .populate('studentProfile.class', 'name')
    .select('firstName lastName studentProfile avatar')
    .limit(50);

  return sendSuccess(res, 200, 'Unlinked students', { students });
};

// @desc    Every assignment for the caller's children, with each child's status
// @route   GET /api/v1/parents/children/assignments
// @access  Parent
const getChildrenAssignments = async (req, res) => {
  const parent = await User.findById(req.user._id).populate({
    path: 'parentProfile.children',
    populate: { path: 'studentProfile.class', select: 'name' },
  });

  const children = parent?.parentProfile?.children || [];

  if (!children.length) {
    return sendSuccess(res, 200, 'No children found', { assignments: [] });
  }

  const childrenIds = children.map((child) => child._id);
  // The class is populated so the child list below can show its name; the
  // query needs the id.
  const childClasses = children
    .map((child) => child.studentProfile?.class?._id)
    .filter(Boolean);

  const [assignments, submissions] = await Promise.all([
    // Published only: a draft is the teacher's, not the family's.
    Assignment.find({
      class: { $in: childClasses },
      isActive: true,
      isPublished: true,
    })
      .populate('class', 'name')
      .populate('subject', 'name code')
      .populate('teacher', 'firstName lastName')
      .sort({ dueDate: -1 }),
    Submission.find({ student: { $in: childrenIds } })
      .populate('student', 'firstName lastName')
      .lean(),
  ]);

  // Index submissions by assignment+student so the join below is a lookup
  // rather than a scan of every submission per assignment per child.
  const submissionIndex = new Map();
  submissions.forEach((sub) => {
    submissionIndex.set(`${sub.assignment}:${sub.student?._id}`, sub);
  });

  const assignmentData = assignments.map((assignment) => {
    const childrenData = {};

    children.forEach((child) => {
      const submission = submissionIndex.get(`${assignment._id}:${child._id}`);

      childrenData[String(child._id)] = {
        childName: `${child.firstName} ${child.lastName}`,
        status: submission?.status || 'Not Submitted',
        submittedAt: submission?.submittedAt || null,
        isLate: submission?.isLate || false,
        score: submission?.score ?? null,
        feedback: submission?.feedback || null,
      };
    });

    return {
      _id: assignment._id,
      title: assignment.title,
      description: assignment.description,
      subject: assignment.subject,
      class: assignment.class,
      dueDate: assignment.dueDate,
      totalMarks: assignment.totalMarks,
      isOverdue: new Date() > assignment.dueDate,
      childrenData,
    };
  });

  return sendSuccess(res, 200, 'Children assignments retrieved', {
    assignments: assignmentData,
    children: children.map((child) => ({
      _id: child._id,
      name: `${child.firstName} ${child.lastName}`,
      class: child.studentProfile?.class?.name,
    })),
  });
};

module.exports = {
  getParents,
  createParent,
  updateParent,
  linkChild,
  deleteParent,
  getUnlinkedStudents,
  getChildrenAssignments,
};
