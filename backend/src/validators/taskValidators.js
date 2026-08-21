const { body, query } = require('express-validator');
const {
  TASK_STATUS,
  TASK_PRIORITY,
  TASK_CATEGORY,
} = require('../config/constants');
const {
  objectIdParam,
  optionalObjectIdBody,
  stringBody,
  dateBody,
  booleanBody,
  paginationQuery,
} = require('./common');

const STATUS_VALUES = Object.values(TASK_STATUS);
const PRIORITY_VALUES = Object.values(TASK_PRIORITY);
const CATEGORY_VALUES = Object.values(TASK_CATEGORY);

const idParam = [objectIdParam('id', 'Task id')];

const priorityBody = () =>
  body('priority')
    .optional({ values: 'falsy' })
    .isIn(PRIORITY_VALUES)
    .withMessage(`Priority must be one of: ${PRIORITY_VALUES.join(', ')}.`);

const categoryBody = () =>
  body('category')
    .optional({ values: 'falsy' })
    .isIn(CATEGORY_VALUES)
    .withMessage(`Category must be one of: ${CATEGORY_VALUES.join(', ')}.`);

const createTaskRules = [
  stringBody('title', 'Task title', { min: 3, max: 200 }),
  stringBody('description', 'Description', { optional: true, max: 5000 }),
  body('assignees')
    .isArray({ min: 1, max: 100 })
    .withMessage('Assign the task to between 1 and 100 staff.'),
  body('assignees.*').isMongoId().withMessage('Invalid staff id.'),
  categoryBody(),
  priorityBody(),
  dateBody('dueDate', 'Due date', { optional: false }),
  optionalObjectIdBody('relatedClass', 'Class'),
  optionalObjectIdBody('relatedSubject', 'Subject'),
  booleanBody('requiresApproval', 'requiresApproval'),
];

const updateTaskRules = [
  ...idParam,
  stringBody('title', 'Task title', { optional: true, min: 3, max: 200 }),
  stringBody('description', 'Description', { optional: true, max: 5000 }),
  categoryBody(),
  priorityBody(),
  dateBody('dueDate', 'Due date'),
  optionalObjectIdBody('relatedClass', 'Class'),
  optionalObjectIdBody('relatedSubject', 'Subject'),
  booleanBody('requiresApproval', 'requiresApproval'),
];

const submitTaskRules = [
  ...idParam,
  stringBody('note', 'Submission note', { optional: true, max: 3000 }),
];

const reviewTaskRules = [
  ...idParam,
  body('decision')
    .exists({ checkFalsy: true })
    .withMessage('A decision is required.')
    .bail()
    .isIn(['approved', 'rejected'])
    .withMessage("Decision must be either 'approved' or 'rejected'."),
  // A rejection with no explanation is a task the teacher cannot act on.
  body('comment')
    .if(body('decision').equals('rejected'))
    .exists({ checkFalsy: true })
    .withMessage('Say why the task is being sent back.')
    .bail()
    .isString()
    .trim()
    .isLength({ min: 3, max: 2000 })
    .withMessage('Comment must be between 3 and 2000 characters.'),
  stringBody('comment', 'Comment', { optional: true, max: 2000 }),
];

const cancelTaskRules = [
  ...idParam,
  stringBody('reason', 'Reason', { optional: true, max: 500 }),
];

const listTaskRules = [
  ...paginationQuery(),
  query('status')
    .optional({ values: 'falsy' })
    .isIn(STATUS_VALUES)
    .withMessage(`Status must be one of: ${STATUS_VALUES.join(', ')}.`),
  query('priority')
    .optional({ values: 'falsy' })
    .isIn(PRIORITY_VALUES)
    .withMessage(`Priority must be one of: ${PRIORITY_VALUES.join(', ')}.`),
  query('category')
    .optional({ values: 'falsy' })
    .isIn(CATEGORY_VALUES)
    .withMessage(`Category must be one of: ${CATEGORY_VALUES.join(', ')}.`),
  query('assignedTo')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Assignee must be a valid id.'),
];

module.exports = {
  idParam,
  createTaskRules,
  updateTaskRules,
  submitTaskRules,
  reviewTaskRules,
  cancelTaskRules,
  listTaskRules,
  STATUS_VALUES,
  PRIORITY_VALUES,
  CATEGORY_VALUES,
};
