const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
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
} = require('../controllers/taskController');
const {
  idParam,
  createTaskRules,
  updateTaskRules,
  submitTaskRules,
  reviewTaskRules,
  cancelTaskRules,
  listTaskRules,
} = require('../validators/taskValidators');

// Staff-only throughout: students and parents have no view of internal work.
router.use(protect, authorize('Admin', 'Teacher'));

// Must precede '/:id' so 'stats' is never read as an id.
router.get('/stats', getTaskStats);

router.get('/', validate(listTaskRules), getTasks);

router.get('/:id', validate(idParam), getTaskById);

router.post('/', authorize('Admin'), validate(createTaskRules), createTasks);

router.put('/:id', authorize('Admin'), validate(updateTaskRules), updateTask);

// The teacher's side of the workflow. Ownership is enforced in the controller.
router.patch('/:id/start', validate(idParam), startTask);
router.post('/:id/submit', validate(submitTaskRules), submitTask);

// The admin's side.
router.post(
  '/:id/review',
  authorize('Admin'),
  validate(reviewTaskRules),
  reviewTask,
);

router.patch(
  '/:id/cancel',
  authorize('Admin'),
  validate(cancelTaskRules),
  cancelTask,
);

router.delete('/:id', authorize('Admin'), validate(idParam), deleteTask);

module.exports = router;
