const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getExams,
  createExam,
  updateExam,
  deleteExam,
} = require('../controllers/examController');
const {
  createExamRules,
  updateExamRules,
  idParam,
} = require('../validators/academicValidators');

router.get('/', protect, getExams);

router.post(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  validate(createExamRules),
  createExam,
);

router.put(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  validate(updateExamRules),
  updateExam,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin', 'Teacher'),
  validate(idParam),
  deleteExam,
);

module.exports = router;
