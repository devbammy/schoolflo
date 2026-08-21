const mongoose = require('mongoose');
const {
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_CATEGORY,
} = require('../config/constants');

/**
 * A piece of work an admin has asked a member of staff to do, and — where it
 * matters — the approval that closes it.
 *
 * One document per assignee, never one document with an array of them. A task
 * given to six teachers is six independent pieces of work: each has its own
 * status, its own submission and its own approval decision, and collapsing
 * them into a single record would make "who still owes me their broadsheet?"
 * unanswerable. Tasks created together share a `batchId` so the admin can
 * still see them as one issuance.
 */

const STATUS_VALUES = Object.values(TASK_STATUS);

const TaskSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Task title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
      default: '',
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    assignedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Shared by every task created in one go, so a batch stays legible.
    batchId: {
      type: String,
      index: true,
    },

    category: {
      type: String,
      enum: Object.values(TASK_CATEGORY),
      default: TASK_CATEGORY.GENERAL,
    },
    priority: {
      type: String,
      enum: Object.values(TASK_PRIORITY),
      default: TASK_PRIORITY.NORMAL,
    },
    dueDate: {
      type: Date,
      required: [true, 'A due date is required'],
    },

    // Optional context: "enter CA scores for JSS2 Mathematics".
    relatedClass: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
    relatedSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },

    /**
     * Whether finishing the work ends it, or hands it to an admin to sign off.
     * A task that needs no approval goes straight from Submitted to Completed.
     */
    requiresApproval: {
      type: Boolean,
      default: true,
    },

    status: {
      type: String,
      enum: STATUS_VALUES,
      default: TASK_STATUS.PENDING,
      index: true,
    },

    // What the teacher handed in.
    submission: {
      note: { type: String, trim: true, maxlength: 3000 },
      submittedAt: Date,
      attempt: { type: Number, default: 0 },
    },

    // What the admin decided. Kept as the latest decision; every decision is
    // also written to the audit log, which is the durable history.
    review: {
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: Date,
      decision: { type: String, enum: ['approved', 'rejected'] },
      comment: { type: String, trim: true, maxlength: 2000 },
    },

    completedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// The three ways this collection is actually read: one teacher's list, the
// admin's approval queue, and "what is overdue".
TaskSchema.index({ assignedTo: 1, status: 1, dueDate: 1 });
TaskSchema.index({ status: 1, dueDate: 1 });
TaskSchema.index({ assignedBy: 1, createdAt: -1 });

/** Terminal states — work that is no longer owed. */
const CLOSED = [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELLED];

TaskSchema.virtual('isOverdue').get(function () {
  if (CLOSED.includes(this.status)) return false;
  if (this.status === TASK_STATUS.SUBMITTED) return false; // it is with the admin now
  return this.dueDate ? new Date(this.dueDate) < new Date() : false;
});

TaskSchema.statics.CLOSED_STATUSES = CLOSED;

/**
 * Counts for a dashboard tile, scoped to one teacher or to the whole school.
 */
TaskSchema.statics.getStats = async function (filter = {}) {
  const rows = await this.aggregate([
    { $match: filter },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);

  const stats = STATUS_VALUES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

  let total = 0;
  rows.forEach((row) => {
    stats[row._id] = row.count;
    total += row.count;
  });

  const overdue = await this.countDocuments({
    ...filter,
    status: { $nin: [...CLOSED, TASK_STATUS.SUBMITTED] },
    dueDate: { $lt: new Date() },
  });

  return { ...stats, total, overdue };
};

module.exports = mongoose.model('Task', TaskSchema);
