const express = require('express');
const request = require('supertest');
require('express-async-errors');

const db = require('../setup/db');

jest.mock('../../src/services/notificationService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendBulkEmails: jest.fn().mockResolvedValue({ sent: 0, failed: 0, total: 0 }),
  verifyTransport: jest.fn().mockResolvedValue(true),
  emailTemplates: new Proxy({}, { get: () => () => '<html></html>' }),
}));

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ success: true, queued: true }),
  enqueueBulkEmail: jest.fn().mockResolvedValue({ queued: 0, total: 0 }),
  startJobQueue: jest.fn(),
  stopJobQueue: jest.fn(),
}));

jest.mock('../../src/services/auditService', () => ({
  record: jest.fn().mockResolvedValue(undefined),
  diff: jest.fn(() => ({})),
}));

const User = require('../../src/models/User');
const Task = require('../../src/models/Task');
const taskController = require('../../src/controllers/taskController');
const validate = require('../../src/middleware/validate');
const { authorize } = require('../../src/middleware/rbac');
const errorHandler = require('../../src/middleware/errorHandler');
const {
  createTaskRules,
  submitTaskRules,
  reviewTaskRules,
} = require('../../src/validators/taskValidators');

let actingUser;
let admin;
let teacher;
let otherTeacher;

/**
 * The task routes with authentication stubbed out. `protect` is exercised
 * elsewhere; what matters here is what the handlers do with the user they are
 * handed — above all, that one teacher cannot touch another's work.
 */
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  req.user = actingUser;
  next();
});
app.post(
  '/tasks',
  authorize('Admin'),
  validate(createTaskRules),
  taskController.createTasks,
);
app.get('/tasks', taskController.getTasks);
app.get('/tasks/stats', taskController.getTaskStats);
app.patch('/tasks/:id/start', taskController.startTask);
app.post(
  '/tasks/:id/submit',
  validate(submitTaskRules),
  taskController.submitTask,
);
app.post(
  '/tasks/:id/review',
  authorize('Admin'),
  validate(reviewTaskRules),
  taskController.reviewTask,
);
app.use(errorHandler);

const makeUser = (role, firstName, extra = {}) =>
  User.create({
    firstName,
    lastName: 'Test',
    email: `${firstName.toLowerCase()}@school.com`,
    password: 'password123',
    role,
    ...extra,
  });

const tomorrow = () => new Date(Date.now() + 24 * 60 * 60 * 1000);

const assignTask = (overrides = {}) =>
  request(app)
    .post('/tasks')
    .send({
      title: 'Submit JSS2 broadsheet',
      description: 'Complete CA and exam columns.',
      assignees: [String(teacher._id)],
      dueDate: tomorrow().toISOString(),
      priority: 'High',
      ...overrides,
    });

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jest.clearAllMocks();

  admin = await makeUser('Admin', 'Ada');
  teacher = await makeUser('Teacher', 'Bola');
  otherTeacher = await makeUser('Teacher', 'Chidi');

  actingUser = admin;
});

describe('assigning tasks', () => {
  it('creates one task per assignee, sharing a batch id', async () => {
    const res = await assignTask({
      assignees: [String(teacher._id), String(otherTeacher._id)],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.tasks).toHaveLength(2);

    const [first, second] = res.body.data.tasks;
    expect(first.batchId).toBe(second.batchId);
    expect(first.assignedTo).not.toBe(second.assignedTo);
    expect(first.status).toBe('Pending');
  });

  it('skips an assignee who is not active staff', async () => {
    const student = await makeUser('Student', 'Dami');

    const res = await assignTask({
      assignees: [String(teacher._id), String(student._id)],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.tasks).toHaveLength(1);
    expect(res.body.data.skipped).toBe(1);
  });

  it('rejects a task with no assignee at all', async () => {
    const res = await assignTask({ assignees: [] });
    expect(res.status).toBe(400);
  });

  it('refuses a teacher trying to assign work', async () => {
    actingUser = teacher;
    const res = await assignTask();
    expect(res.status).toBe(403);
  });
});

describe('the teacher side', () => {
  let task;

  beforeEach(async () => {
    await assignTask();
    task = await Task.findOne({ assignedTo: teacher._id });
    actingUser = teacher;
  });

  it('lists only the teacher’s own tasks, whatever the query says', async () => {
    await Task.create({
      title: "Someone else's task",
      assignedTo: otherTeacher._id,
      assignedBy: admin._id,
      dueDate: tomorrow(),
    });

    const res = await request(app)
      .get('/tasks')
      .query({ assignedTo: String(otherTeacher._id) });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(String(res.body.data[0].assignedTo._id)).toBe(String(teacher._id));
  });

  it('moves a pending task to in progress', async () => {
    const res = await request(app).patch(`/tasks/${task._id}/start`);

    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe('In Progress');
  });

  it('sends a submitted task for approval', async () => {
    const res = await request(app)
      .post(`/tasks/${task._id}/submit`)
      .send({ note: 'Broadsheet uploaded to the shared drive.' });

    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe('Submitted');
    expect(res.body.data.task.submission.attempt).toBe(1);
  });

  it('closes a task outright when no approval was asked for', async () => {
    await Task.findByIdAndUpdate(task._id, { requiresApproval: false });

    const res = await request(app).post(`/tasks/${task._id}/submit`).send({});

    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe('Completed');
    expect(res.body.data.task.completedAt).toBeTruthy();
  });

  it('will not let a teacher touch a task assigned to someone else', async () => {
    actingUser = otherTeacher;

    const res = await request(app).post(`/tasks/${task._id}/submit`).send({});

    expect(res.status).toBe(403);
  });

  it('refuses a second submission while the first is under review', async () => {
    await request(app).post(`/tasks/${task._id}/submit`).send({});

    const res = await request(app).post(`/tasks/${task._id}/submit`).send({});

    expect(res.status).toBe(400);
  });
});

describe('approval', () => {
  let task;

  beforeEach(async () => {
    await assignTask();
    task = await Task.findOne({ assignedTo: teacher._id });

    actingUser = teacher;
    await request(app).post(`/tasks/${task._id}/submit`).send({ note: 'Done' });
    actingUser = admin;
  });

  it('completes the task when approved', async () => {
    const res = await request(app)
      .post(`/tasks/${task._id}/review`)
      .send({ decision: 'approved', comment: 'Looks right.' });

    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe('Completed');
    expect(res.body.data.task.review.decision).toBe('approved');
  });

  it('sends the task back when rejected', async () => {
    const res = await request(app)
      .post(`/tasks/${task._id}/review`)
      .send({ decision: 'rejected', comment: 'Third term column is empty.' });

    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe('Rejected');
  });

  it('will not accept a rejection with no explanation', async () => {
    const res = await request(app)
      .post(`/tasks/${task._id}/review`)
      .send({ decision: 'rejected' });

    expect(res.status).toBe(400);
  });

  it('clears the old decision when a rejected task is resubmitted', async () => {
    await request(app)
      .post(`/tasks/${task._id}/review`)
      .send({ decision: 'rejected', comment: 'Missing exam scores.' });

    actingUser = teacher;
    const res = await request(app)
      .post(`/tasks/${task._id}/submit`)
      .send({ note: 'Exam scores added.' });

    expect(res.status).toBe(200);
    expect(res.body.data.task.status).toBe('Submitted');
    expect(res.body.data.task.submission.attempt).toBe(2);
    expect(res.body.data.task.review?.decision).toBeFalsy();
  });

  it('refuses to review a task that has not been submitted', async () => {
    const pending = await Task.create({
      title: 'Not yet handed in',
      assignedTo: teacher._id,
      assignedBy: admin._id,
      dueDate: tomorrow(),
    });

    const res = await request(app)
      .post(`/tasks/${pending._id}/review`)
      .send({ decision: 'approved' });

    expect(res.status).toBe(400);
  });
});

describe('stats', () => {
  it('counts an overdue task that is still owed', async () => {
    await Task.create({
      title: 'Overdue lesson plan',
      assignedTo: teacher._id,
      assignedBy: admin._id,
      dueDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
      status: 'In Progress',
    });

    // A task already with the admin is not the teacher's problem any more,
    // so it must not be counted against them.
    await Task.create({
      title: 'Submitted late but handed in',
      assignedTo: teacher._id,
      assignedBy: admin._id,
      dueDate: new Date(Date.now() - 48 * 60 * 60 * 1000),
      status: 'Submitted',
    });

    actingUser = teacher;
    const res = await request(app).get('/tasks/stats');

    expect(res.status).toBe(200);
    expect(res.body.data.stats.overdue).toBe(1);
    expect(res.body.data.stats.total).toBe(2);
  });

  it('scopes a teacher’s stats to their own tasks', async () => {
    await Task.create({
      title: "Another teacher's task",
      assignedTo: otherTeacher._id,
      assignedBy: admin._id,
      dueDate: tomorrow(),
    });

    actingUser = teacher;
    const mine = await request(app).get('/tasks/stats');
    expect(mine.body.data.stats.total).toBe(0);

    actingUser = admin;
    const all = await request(app).get('/tasks/stats');
    expect(all.body.data.stats.total).toBe(1);
  });
});
