const User = require('../models/User');
const Session = require('../models/Session');
const { Fees, Payment } = require('../models/Fees');
const AcademicCalendar = require('../models/AcademicCalendar');
const Attendance = require('../models/Attendance');
const { Result } = require('../models/Exam');
const { BorrowRecord } = require('../models/Library');
const Task = require('../models/Task');
const StaffAttendance = require('../models/StaffAttendance');
const Class = require('../models/Class');
const Subject = require('../models/Subject');
const Certificate = require('../models/Certificate');
const { Assignment, Submission } = require('../models/Assignment');
const { Exam } = require('../models/Exam');
const { getCurrentPeriod } = require('../utils/academicPeriod');
const {
  getTeacherRosterClassIds,
  assertRosterAccess,
} = require('../utils/teacherScope');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { applySort } = require('../utils/listSort');
const audit = require('../services/auditService');
const {
  uploadToCloudinary,
  deleteFromCloudinary,
} = require('../services/fileService');

// Regex metacharacters in a search box would otherwise be interpreted, letting
// a user craft a pattern that scans the whole collection.
const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Tag each student on a page with where they stand on this term's fees:
//   cleared  — paid the class fee in full
//   partial  — paid something, still owes
//   overdue  — nothing paid and the due date has passed
//   owing    — nothing paid, not yet overdue
//   none     — no active fee structure for their class this term
//
// The academic calendar is the authority on which term/year we are billing.
// One calendar read + one Fees query + one Payment aggregation for the whole
// page, so the cost does not scale with the number of students shown.
const attachFeeStatus = async (students) => {
  if (!students.length) return students;

  const calendar = await AcademicCalendar.findOne({ isActive: true });
  const term = calendar?.currentTerm?.name || calendar?.terms?.[0]?.name;
  const academicYear = calendar?.academicYear;
  if (!term || !academicYear) {
    return students.map((s) => ({ ...s, feeStatus: 'none' }));
  }

  const classIdOf = (s) =>
    s.studentProfile?.class?._id || s.studentProfile?.class || null;

  const classIds = [
    ...new Set(students.map(classIdOf).filter(Boolean).map(String)),
  ];

  const fees = await Fees.find({
    term,
    academicYear,
    isActive: true,
    class: { $in: classIds },
  })
    .select('class totalAmount dueDate')
    .lean();

  const feeByClass = new Map(fees.map((f) => [String(f.class), f]));
  const feeIds = fees.map((f) => f._id);

  const paidRows = feeIds.length
    ? await Payment.aggregate([
        {
          $match: {
            student: { $in: students.map((s) => s._id) },
            feeStructure: { $in: feeIds },
          },
        },
        { $group: { _id: '$student', paid: { $sum: '$amountPaid' } } },
      ])
    : [];
  const paidByStudent = new Map(
    paidRows.map((r) => [String(r._id), Number(r.paid) || 0]),
  );

  const now = new Date();
  return students.map((s) => {
    const fee = feeByClass.get(String(classIdOf(s) || ''));
    if (!fee || !(fee.totalAmount > 0)) return { ...s, feeStatus: 'none' };

    const paid = paidByStudent.get(String(s._id)) || 0;
    const total = Math.round(fee.totalAmount);
    let feeStatus;
    if (paid >= total) feeStatus = 'cleared';
    else if (paid > 0) feeStatus = 'partial';
    else if (fee.dueDate && new Date(fee.dueDate) < now) feeStatus = 'overdue';
    else feeStatus = 'owing';
    return { ...s, feeStatus };
  });
};

// @desc    List users, filtered and paginated
// @route   GET /api/v1/users
// @access  Admin
const getUsers = async (req, res) => {
  const {
    role,
    search,
    isActive,
    class: classId,
    gender,
    withFeeStatus,
  } = req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (classId) filter['studentProfile.class'] = classId;
  if (gender) filter['studentProfile.gender'] = gender;

  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [
      { firstName: pattern },
      { lastName: pattern },
      { email: pattern },
      { 'studentProfile.admissionNumber': pattern },
      { 'teacherProfile.staffId': pattern },
    ];
  }

  const [users, total] = await Promise.all([
    applySort(User.find(filter), req.query.sort, ['firstName', 'lastName'])
      .populate('studentProfile.class', 'name level')
      .populate(
        'studentProfile.parentId',
        'firstName lastName phone parentProfile.relationship',
      )
      .select('-password')
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  let data = users;
  if (role === 'Student' && withFeeStatus === 'true' && users.length) {
    data = await attachFeeStatus(
      users.map((u) => u.toObject({ virtuals: true })),
    );
  }

  return sendPaginated(res, data, total, page, limit);
};

// @desc    Get one user
// @route   GET /api/v1/users/:id
// @access  Admin, Teacher
const getUserById = async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('studentProfile.class', 'name level')
    .populate(
      'studentProfile.parentId',
      'firstName lastName phone parentProfile.relationship',
    )
    .populate('teacherProfile.classTeacherOf', 'name')
    .populate('teacherProfile.subjectsTaught', 'name code')
    .select('-password');

  if (!user) throw AppError.notFound('User not found');

  // This route was open to any Teacher for any id, which handed every teacher
  // the full profile of every colleague, every parent and every admin in the
  // school. A teacher's business here is the students they are responsible
  // for, and `getTeacherClassIds` is the one definition of that.
  if (
    req.user.role === 'Teacher' &&
    String(req.user._id) !== String(user._id)
  ) {
    const scoped =
      user.role === 'Student' &&
      (await getTeacherRosterClassIds(req.user)).includes(
        String(user.studentProfile?.class?._id || user.studentProfile?.class),
      );

    if (!scoped) {
      throw AppError.forbidden(
        'You can only view students in a class you teach.',
      );
    }
  }

  return sendSuccess(res, 200, 'User fetched', { user });
};

// @desc    One user's full profile plus the role-specific records an admin
//          would otherwise have to visit four other pages to piece together.
// @route   GET /api/v1/users/:id/profile
// @access  Admin
const getUserProfile = async (req, res) => {
  const user = await User.findById(req.params.id)
    .populate('studentProfile.class', 'name level sections')
    .populate(
      'studentProfile.parentId',
      'firstName lastName email phone avatar parentProfile.relationship parentProfile.occupation',
    )
    .populate('teacherProfile.classTeacherOf', 'name level')
    .populate('teacherProfile.subjectsTaught', 'name code')
    .populate({
      path: 'parentProfile.children',
      select:
        'firstName lastName email phone avatar isActive studentProfile.admissionNumber studentProfile.gender studentProfile.class',
      populate: { path: 'studentProfile.class', select: 'name level' },
    })
    .select('-password');

  if (!user) throw AppError.notFound('User not found');

  const { term, academicYear } = await getCurrentPeriod();
  const related = { period: { term, academicYear } };

  if (user.role === 'Student') {
    const studentId = user._id;
    const classId = user.studentProfile?.class?._id || null;

    const [attendance, results, library, feeStructures] = await Promise.all([
      Attendance.getSummary(studentId, term, academicYear),
      Result.find({ student: studentId })
        .populate('subject', 'name code')
        .populate('class', 'name')
        .sort({ academicYear: -1, term: -1, updatedAt: -1 })
        .limit(60)
        .lean(),
      BorrowRecord.find({ borrower: studentId })
        .populate('book', 'title author isbn')
        .sort({ issueDate: -1 })
        .limit(20)
        .lean(),
      classId
        ? Fees.find({ class: classId, isActive: true })
            .sort({ academicYear: -1 })
            .lean()
        : Promise.resolve([]),
    ]);

    const payments = await Payment.find({ student: studentId })
      .populate('feeStructure', 'title term academicYear totalAmount')
      .sort({ createdAt: -1 })
      .lean();

    const currentFee = feeStructures.find(
      (f) => f.term === term && f.academicYear === academicYear,
    );
    const currentPaid = currentFee
      ? payments
          .filter((p) => String(p.feeStructure?._id) === String(currentFee._id))
          .reduce((sum, p) => sum + (p.amountPaid || 0), 0)
      : 0;

    let feeStatus = 'none';
    if (currentFee && currentFee.totalAmount > 0) {
      if (currentPaid >= currentFee.totalAmount) feeStatus = 'cleared';
      else if (currentPaid > 0) feeStatus = 'partial';
      else if (currentFee.dueDate && new Date(currentFee.dueDate) < new Date())
        feeStatus = 'overdue';
      else feeStatus = 'owing';
    }

    related.attendance = attendance;
    related.results = results;
    related.library = library;
    related.fees = {
      currentTerm: currentFee
        ? {
            title: currentFee.title,
            totalAmount: currentFee.totalAmount,
            paid: currentPaid,
            balance: Math.max(currentFee.totalAmount - currentPaid, 0),
            dueDate: currentFee.dueDate,
            status: feeStatus,
          }
        : null,
      totalPaidAllTime: payments.reduce(
        (sum, p) => sum + (p.amountPaid || 0),
        0,
      ),
      payments: payments.slice(0, 20),
    };

    if (user.studentProfile?.parentId) {
      related.siblings = await User.find({
        role: 'Student',
        _id: { $ne: studentId },
        'studentProfile.parentId': user.studentProfile.parentId._id,
      })
        .select('firstName lastName avatar studentProfile.admissionNumber')
        .populate('studentProfile.class', 'name')
        .lean();
    }
  }

  if (user.role === 'Teacher') {
    const teacherId = user._id;
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [taskStats, recentTasks, staffSummary, recentAttendance, sectionsOf] =
      await Promise.all([
        Task.getStats({ assignedTo: teacherId }),
        Task.find({ assignedTo: teacherId })
          .populate('relatedClass', 'name')
          .populate('relatedSubject', 'name')
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        StaffAttendance.getSummary({
          staff: teacherId,
          date: { $gte: since },
        }),
        StaffAttendance.find({ staff: teacherId })
          .sort({ date: -1 })
          .limit(14)
          .lean(),
        Class.find({ 'sections.classTeacher': teacherId })
          .select('name level sections')
          .lean(),
      ]);

    related.tasks = { stats: taskStats, recent: recentTasks };
    related.staffAttendance = {
      summaryLast30Days: staffSummary,
      recent: recentAttendance,
    };
    related.classesTeaching = sectionsOf.map((c) => ({
      _id: c._id,
      name: c.name,
      level: c.level,
      sections: (c.sections || [])
        .filter((s) => String(s.classTeacher) === String(teacherId))
        .map((s) => s.name),
    }));
  }

  if (user.role === 'Parent') {
    const kids = user.parentProfile?.children || [];
    related.children = await Promise.all(
      kids.map(async (child) => {
        const summary = await Attendance.getSummary(
          child._id,
          term,
          academicYear,
        ).catch(() => null);
        return { ...child.toObject(), attendance: summary };
      }),
    );
  }

  return sendSuccess(res, 200, 'Profile fetched', { user, related });
};

// @desc    Update a user's profile
// @route   PUT /api/v1/users/:id
// @access  Admin
const updateUser = async (req, res) => {
  // password, email and role are stripped: each has its own dedicated flow and
  // must not be mass-assignable from a profile edit.
  // Beyond those three, nothing the system manages itself may be set from a
  // profile form: isActive has its own route (with the last-admin and
  // self-lockout rules), and the reset-token, session and avatar fields belong
  // to the flows that maintain them.
  const {
    password,
    email,
    role,
    isActive,
    isEmailVerified,
    passwordResetToken,
    passwordResetExpire,
    passwordChangedAt,
    lastLogin,
    avatar,
    ...updateData
  } = req.body;

  const before = await User.findById(req.params.id)
    .select('firstName lastName phone studentProfile teacherProfile role')
    .lean();
  if (!before) throw AppError.notFound('User not found');

  const user = await User.findByIdAndUpdate(req.params.id, updateData, {
    new: true,
    runValidators: true,
  }).select('-password');

  if (!user) throw AppError.notFound('User not found');

  // Moving a child to another class, or marking them Withdrawn, changes what
  // they are billed and where they are marked present — it should be possible
  // to say who did it.
  const tracked = (doc) => ({
    firstName: doc.firstName,
    lastName: doc.lastName,
    phone: doc.phone,
    class: doc.studentProfile?.class,
    profileStatus: doc.studentProfile?.profileStatus,
    parentId: doc.studentProfile?.parentId,
    classTeacherOf: doc.teacherProfile?.classTeacherOf,
  });

  await audit.record(req, {
    action: 'user.update',
    entity: 'User',
    entityId: user._id,
    entityLabel: `${user.firstName} ${user.lastName}`,
    subject: user.role === 'Student' ? user._id : undefined,
    changes: audit.diff(tracked(before), tracked(user)),
    meta: { role: user.role },
  });

  return sendSuccess(res, 200, 'User updated', { user });
};

/**
 * Refuse to remove the last way into the portal. With no active admin nobody
 * can reactivate anybody, create accounts or undo the mistake — the school is
 * locked out of its own system and the fix is editing the database by hand.
 */
const assertNotLastAdmin = async (user, verb) => {
  if (user.role !== 'Admin' || !user.isActive) return;

  const otherAdmins = await User.countDocuments({
    role: 'Admin',
    isActive: true,
    _id: { $ne: user._id },
  });

  if (otherAdmins === 0) {
    throw AppError.badRequest(
      `This is the only active administrator, so it cannot be ${verb}d. Make another administrator first.`,
    );
  }
};

/**
 * A student or teacher with academic, financial or work records cannot be
 * deleted: the results, payments, registers and certificates filed under them
 * would be left pointing at nobody, and the financial report and report cards
 * would quietly lose rows. Deactivating keeps every record and still stops
 * the account signing in. People with nothing filed against them — a duplicate
 * or a typo — can still be removed.
 */
const assertNoRecords = async (user) => {
  const id = user._id;
  let counts = {};

  if (user.role === 'Student') {
    const [results, payments, attendance, certificates, submissions] =
      await Promise.all([
        Result.countDocuments({ student: id }),
        Payment.countDocuments({ student: id }),
        Attendance.countDocuments({ student: id }),
        Certificate.countDocuments({ student: id }),
        Submission.countDocuments({ student: id }),
      ]);
    counts = { results, payments, attendance, certificates, submissions };
  } else if (user.role === 'Teacher') {
    const [assignments, exams, tasks, staffAttendance, gradedResults] =
      await Promise.all([
        Assignment.countDocuments({ teacher: id }),
        Exam.countDocuments({ teacher: id }),
        Task.countDocuments({ assignedTo: id }),
        StaffAttendance.countDocuments({ staff: id }),
        Result.countDocuments({ gradedBy: id }),
      ]);
    counts = { assignments, exams, tasks, staffAttendance, gradedResults };
  }

  const held = Object.entries(counts).filter(([, n]) => n > 0);
  if (held.length) {
    throw AppError.conflict(
      `This ${user.role.toLowerCase()} has records (${held
        .map(([name, n]) => `${n} ${name}`)
        .join(', ')}) that would be orphaned. Deactivate the account instead.`,
    );
  }
};

/** Tidy the references other documents keep to a user who is now gone. */
const removeLinksTo = async (user) => {
  const id = user._id;

  if (user.role === 'Student') {
    await User.updateMany(
      { 'parentProfile.children': id },
      { $pull: { 'parentProfile.children': id } },
    );
  } else if (user.role === 'Teacher') {
    await Promise.all([
      Class.updateMany(
        { 'sections.classTeacher': id },
        { $set: { 'sections.$[s].classTeacher': null } },
        { arrayFilters: [{ 's.classTeacher': id }] },
      ),
      Subject.updateMany({ teachers: id }, { $pull: { teachers: id } }),
    ]);
  } else if (user.role === 'Parent') {
    await User.updateMany(
      { 'studentProfile.parentId': id },
      { $unset: { 'studentProfile.parentId': '' } },
    );
  }
};

// @desc    Activate / deactivate a user
// @route   PATCH /api/v1/users/:id/toggle-status
// @access  Admin
const toggleUserStatus = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  // Only deactivation is dangerous. Reactivating is always fine.
  if (user.isActive) {
    if (String(user._id) === String(req.user._id)) {
      throw AppError.badRequest('You cannot deactivate your own account.');
    }
    await assertNotLastAdmin(user, 'deactivate');
  }

  user.isActive = !user.isActive;
  await user.save({ validateBeforeSave: false });

  // Deactivating must also cut off existing sessions, otherwise the account
  // keeps working until its refresh token happens to expire.
  if (!user.isActive) {
    await Session.deleteMany({ user: user._id });
  }

  await audit.record(req, {
    action: user.isActive ? 'user.activate' : 'user.deactivate',
    entity: 'User',
    entityId: user._id,
    entityLabel: `${user.firstName} ${user.lastName}`,
    meta: { role: user.role, sessionsRevoked: !user.isActive },
  });

  return sendSuccess(
    res,
    200,
    `User ${user.isActive ? 'activated' : 'deactivated'}`,
    { isActive: user.isActive },
  );
};

// @desc    Delete a user
// @route   DELETE /api/v1/users/:id
// @access  Admin
const deleteUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  if (String(user._id) === String(req.user._id)) {
    throw AppError.badRequest('You cannot delete your own account.');
  }

  await assertNotLastAdmin(user, 'delete');
  await assertNoRecords(user);

  if (user.avatar?.publicId) {
    await deleteFromCloudinary(user.avatar.publicId, 'image');
  }

  await Session.deleteMany({ user: user._id });

  // Recorded BEFORE the delete — afterwards there is nothing left to describe.
  await audit.record(req, {
    action: 'user.delete',
    entity: 'User',
    entityId: user._id,
    entityLabel: `${user.firstName} ${user.lastName}`,
    subject: user.role === 'Student' ? user._id : undefined,
    meta: {
      email: user.email,
      role: user.role,
      admissionNumber: user.studentProfile?.admissionNumber,
      staffId: user.teacherProfile?.staffId,
    },
  });

  await user.deleteOne();
  await removeLinksTo(user);

  return sendSuccess(res, 200, 'User deleted');
};

// @desc    Upload or replace a user's avatar
// @route   POST /api/v1/users/:id/avatar
// @access  Admin, or the user themselves
const uploadUserAvatar = async (req, res) => {
  if (String(req.user._id) !== req.params.id && req.user.role !== 'Admin') {
    throw AppError.forbidden('You can only update your own avatar');
  }

  if (!req.file) throw AppError.badRequest('No image uploaded');

  const user = await User.findById(req.params.id);
  if (!user) throw AppError.notFound('User not found');

  if (user.avatar?.publicId) {
    await deleteFromCloudinary(user.avatar.publicId, 'image');
  }

  const result = await uploadToCloudinary(req.file.buffer, 'avatars', {
    transformation: [
      { width: 300, height: 300, crop: 'fill', gravity: 'face' },
    ],
  });

  user.avatar = { url: result.secure_url, publicId: result.public_id };
  await user.save({ validateBeforeSave: false });

  return sendSuccess(res, 200, 'Avatar updated', {
    avatarUrl: result.secure_url,
  });
};

// @desc    Active students in a class
// @route   GET /api/v1/users/students/class/:classId
// @access  Admin, Teacher
const getStudentsInClass = async (req, res) => {
  // A teacher lists the roster of a class they teach, not of any class in
  // the school. Without this the check on GET /users/:id above is decoration:
  // the whole roster, parent contact details included, is one request away.
  await assertRosterAccess(req.user, req.params.classId);

  const students = await User.find({
    role: 'Student',
    'studentProfile.class': req.params.classId,
    // Include students whose profileStatus is 'Active' OR not yet set —
    // findByIdAndUpdate does not apply schema defaults, so the field may be
    // missing on students created via an update rather than a create.
    'studentProfile.profileStatus': { $in: ['Active', null, undefined] },
  })
    .populate('studentProfile.class', 'name')
    .select('-password')
    .sort({ lastName: 1 });

  return sendSuccess(res, 200, 'Students fetched', {
    students,
    count: students.length,
  });
};

module.exports = {
  getUsers,
  getUserById,
  getUserProfile,
  updateUser,
  toggleUserStatus,
  deleteUser,
  uploadUserAvatar,
  getStudentsInClass,
};
