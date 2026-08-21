const crypto = require('crypto');
const Task = require('../models/Task');
const User = require('../models/User');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { enqueueEmail } = require('../services/jobQueue');
const { emailTemplates } = require('../services/notificationService');
const { TASK_STATUS } = require('../config/constants');

const POPULATE = [
  {
    path: 'assignedTo',
    select: 'firstName lastName email avatar teacherProfile.staffId',
  },
  { path: 'assignedBy', select: 'firstName lastName role' },
  { path: 'relatedClass', select: 'name level' },
  { path: 'relatedSubject', select: 'name code' },
  { path: 'review.reviewedBy', select: 'firstName lastName' },
];

const firstUrl = () => (process.env.CLIENT_URL || '').split(',')[0].trim();

const teacherTaskUrl = (taskId) => `${firstUrl()}/teacher/tasks?task=${taskId}`;

/**
 * Load a task and confirm the caller is allowed to touch it.
 *
 * Ownership is checked here rather than in the route because "yours" means
 * something different per verb: an admin owns every task, a teacher owns only
 * the ones assigned to them, and there is no third case.
 */
const loadTask = async (req) => {
  const task = await Task.findById(req.params.id).populate(POPULATE);

  if (!task) throw AppError.notFound('Task not found');

  if (
    req.user.role !== 'Admin' &&
    String(task.assignedTo?._id || task.assignedTo) !== String(req.user._id)
  ) {
    throw AppError.forbidden('This task is not assigned to you.');
  }

  return task;
};

// @desc    Assign a task to one or more teachers
// @route   POST /api/v1/tasks
// @access  Admin
const createTasks = async (req, res) => {
  const {
    title,
    description,
    assignees,
    category,
    priority,
    dueDate,
    relatedClass,
    relatedSubject,
    requiresApproval,
  } = req.body;

  // Only real, active staff can be given work. Silently creating a task for a
  // deleted account would leave it stuck in the approval queue forever.
  const staff = await User.find({
    _id: { $in: assignees },
    role: { $in: ['Teacher', 'Admin'] },
    isActive: true,
  }).select('firstName lastName email role');

  if (!staff.length) {
    throw AppError.badRequest('None of the selected staff could be assigned.');
  }

  const batchId = crypto.randomUUID();

  const tasks = await Task.insertMany(
    staff.map((member) => ({
      title,
      description,
      assignedTo: member._id,
      assignedBy: req.user._id,
      batchId,
      category,
      priority,
      dueDate,
      relatedClass: relatedClass || undefined,
      relatedSubject: relatedSubject || undefined,
      requiresApproval: requiresApproval !== false,
      status: TASK_STATUS.PENDING,
    })),
  );

  // Queued, not awaited: a slow mail server must not hold up the response.
  tasks.forEach((task, index) => {
    const member = staff[index];

    enqueueEmail({
      to: member.email,
      subject: `New task: ${title}`,
      html: emailTemplates.taskAssigned({
        teacherName: member.firstName,
        title,
        description,
        priority: task.priority,
        dueDate: task.dueDate,
        assignedByName: `${req.user.firstName} ${req.user.lastName}`,
        portalUrl: teacherTaskUrl(task._id),
      }),
    });
  });

  await audit.record(req, {
    action: 'task.assign',
    entity: 'Task',
    entityLabel: title,
    meta: {
      batchId,
      assigned: tasks.length,
      requested: assignees.length,
      dueDate,
      priority,
      assignees: staff.map((member) => String(member._id)),
    },
  });

  const skipped = assignees.length - staff.length;

  return sendSuccess(
    res,
    201,
    skipped > 0
      ? `Task assigned to ${tasks.length} staff (${skipped} skipped — inactive or not staff)`
      : `Task assigned to ${tasks.length} staff`,
    { tasks, batchId, skipped },
  );
};

// @desc    List tasks — every task for an admin, own tasks for a teacher
// @route   GET /api/v1/tasks
// @access  Admin, Teacher
const getTasks = async (req, res) => {
  const { status, priority, category, assignedTo, overdue, batchId } =
    req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = {};

  // A teacher's scope is not negotiable via query string.
  if (req.user.role === 'Teacher') {
    filter.assignedTo = req.user._id;
  } else if (assignedTo) {
    filter.assignedTo = assignedTo;
  }

  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (batchId) filter.batchId = batchId;

  if (overdue === 'true') {
    filter.dueDate = { $lt: new Date() };
    filter.status = {
      $nin: [...Task.CLOSED_STATUSES, TASK_STATUS.SUBMITTED],
    };
  }

  const [tasks, total] = await Promise.all([
    Task.find(filter)
      .populate(POPULATE)
      // Soonest due first — the order both the approval queue and a teacher's
      // list are read in. Sorting by status would only order it alphabetically.
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Task.countDocuments(filter),
  ]);

  return sendPaginated(res, tasks, total, page, limit);
};

// @desc    Counts by status, for dashboard tiles and the approval badge
// @route   GET /api/v1/tasks/stats
// @access  Admin, Teacher
const getTaskStats = async (req, res) => {
  const filter =
    req.user.role === 'Teacher' ? { assignedTo: req.user._id } : {};

  const stats = await Task.getStats(filter);

  return sendSuccess(res, 200, 'Task stats', { stats });
};

// @desc    Get one task
// @route   GET /api/v1/tasks/:id
// @access  Admin, Teacher (own)
const getTaskById = async (req, res) => {
  const task = await loadTask(req);

  return sendSuccess(res, 200, 'Task fetched', { task });
};

// @desc    Edit a task that has not been closed
// @route   PUT /api/v1/tasks/:id
// @access  Admin
const updateTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw AppError.notFound('Task not found');

  if (Task.CLOSED_STATUSES.includes(task.status)) {
    throw AppError.badRequest(
      `A ${task.status.toLowerCase()} task cannot be edited.`,
    );
  }

  const editable = [
    'title',
    'description',
    'category',
    'priority',
    'dueDate',
    'relatedClass',
    'relatedSubject',
    'requiresApproval',
  ];

  const before = {};
  const after = {};

  editable.forEach((field) => {
    if (req.body[field] === undefined) return;
    before[field] = task[field];
    task[field] = req.body[field];
    after[field] = task[field];
  });

  await task.save();

  await audit.record(req, {
    action: 'task.update',
    entity: 'Task',
    entityId: task._id,
    entityLabel: task.title,
    subject: task.assignedTo,
    changes: audit.diff(before, after),
  });

  return sendSuccess(res, 200, 'Task updated', {
    task: await task.populate(POPULATE),
  });
};

// @desc    Teacher accepts a task and starts working on it
// @route   PATCH /api/v1/tasks/:id/start
// @access  Teacher (own), Admin
const startTask = async (req, res) => {
  const task = await loadTask(req);

  if (task.status !== TASK_STATUS.PENDING) {
    throw AppError.badRequest(
      `Only a pending task can be started — this one is ${task.status}.`,
    );
  }

  task.status = TASK_STATUS.IN_PROGRESS;
  await task.save();

  return sendSuccess(res, 200, 'Task started', { task });
};

// @desc    Teacher hands the work in
// @route   POST /api/v1/tasks/:id/submit
// @access  Teacher (own), Admin
const submitTask = async (req, res) => {
  const task = await loadTask(req);

  const submittable = [
    TASK_STATUS.PENDING,
    TASK_STATUS.IN_PROGRESS,
    TASK_STATUS.REJECTED,
  ];

  if (!submittable.includes(task.status)) {
    throw AppError.badRequest(
      `A task that is ${task.status} cannot be submitted again.`,
    );
  }

  const wasLate = task.dueDate && new Date() > new Date(task.dueDate);

  task.submission = {
    note: req.body.note || '',
    submittedAt: new Date(),
    attempt: (task.submission?.attempt || 0) + 1,
  };

  // Where no sign-off was asked for, handing in is the end of it. Parking such
  // a task in an approval queue nobody reads is how queues stop being read.
  if (task.requiresApproval) {
    task.status = TASK_STATUS.SUBMITTED;
  } else {
    task.status = TASK_STATUS.COMPLETED;
    task.completedAt = new Date();
  }

  // A rejected task being resubmitted keeps the old decision on screen
  // otherwise, which reads as though it had been rejected all over again.
  task.review = undefined;

  await task.save();

  await audit.record(req, {
    action: 'task.submit',
    entity: 'Task',
    entityId: task._id,
    entityLabel: task.title,
    meta: {
      attempt: task.submission.attempt,
      late: Boolean(wasLate),
      requiresApproval: task.requiresApproval,
      status: task.status,
    },
  });

  return sendSuccess(
    res,
    200,
    task.requiresApproval
      ? 'Task submitted for approval'
      : 'Task marked complete',
    { task: await task.populate(POPULATE) },
  );
};

// @desc    Admin approves or sends back a submitted task
// @route   POST /api/v1/tasks/:id/review
// @access  Admin
const reviewTask = async (req, res) => {
  const { decision, comment } = req.body;

  const task = await Task.findById(req.params.id).populate(
    'assignedTo',
    'firstName lastName email',
  );

  if (!task) throw AppError.notFound('Task not found');

  if (task.status !== TASK_STATUS.SUBMITTED) {
    throw AppError.badRequest(
      `Only a submitted task can be reviewed — this one is ${task.status}.`,
    );
  }

  const approved = decision === 'approved';

  task.status = approved ? TASK_STATUS.COMPLETED : TASK_STATUS.REJECTED;
  task.completedAt = approved ? new Date() : undefined;
  task.review = {
    reviewedBy: req.user._id,
    reviewedAt: new Date(),
    decision,
    comment: comment || '',
  };

  await task.save();

  if (task.assignedTo?.email) {
    enqueueEmail({
      to: task.assignedTo.email,
      subject: approved
        ? `Task approved: ${task.title}`
        : `Task returned: ${task.title}`,
      html: emailTemplates.taskReviewed({
        teacherName: task.assignedTo.firstName,
        title: task.title,
        decision,
        comment,
        portalUrl: teacherTaskUrl(task._id),
      }),
    });
  }

  await audit.record(req, {
    action: approved ? 'task.approve' : 'task.reject',
    entity: 'Task',
    entityId: task._id,
    entityLabel: task.title,
    subject: task.assignedTo?._id,
    meta: { decision, comment: comment || undefined },
  });

  return sendSuccess(res, 200, approved ? 'Task approved' : 'Task sent back', {
    task: await task.populate(POPULATE),
  });
};

// @desc    Withdraw a task
// @route   PATCH /api/v1/tasks/:id/cancel
// @access  Admin
const cancelTask = async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) throw AppError.notFound('Task not found');

  if (Task.CLOSED_STATUSES.includes(task.status)) {
    throw AppError.badRequest(
      `This task is already ${task.status.toLowerCase()}.`,
    );
  }

  task.status = TASK_STATUS.CANCELLED;
  await task.save();

  await audit.record(req, {
    action: 'task.cancel',
    entity: 'Task',
    entityId: task._id,
    entityLabel: task.title,
    subject: task.assignedTo,
    reason: req.body.reason,
  });

  return sendSuccess(res, 200, 'Task cancelled', { task });
};

// @desc    Delete a task outright
// @route   DELETE /api/v1/tasks/:id
// @access  Admin
const deleteTask = async (req, res) => {
  const task = await Task.findByIdAndDelete(req.params.id);
  if (!task) throw AppError.notFound('Task not found');

  await audit.record(req, {
    action: 'task.delete',
    entity: 'Task',
    entityId: task._id,
    entityLabel: task.title,
    subject: task.assignedTo,
    meta: { status: task.status },
  });

  return sendSuccess(res, 200, 'Task deleted', {});
};

module.exports = {
  createTasks,
  getTasks,
  getTaskStats,
  getTaskById,
  updateTask,
  startTask,
  submitTask,
  reviewTask,
  cancelTask,
  deleteTask,
};
