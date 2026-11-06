const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const { sortQuery } = require('../validators/common');
const {
  getSubjects,
  createSubject,
  updateSubject,
  deactivateSubject,
} = require('../controllers/subjectController');
const {
  createSubjectRules,
  updateSubjectRules,
  idParam,
} = require('../validators/academicValidators');

router.get('/', protect, validate(sortQuery()), getSubjects);

router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(createSubjectRules),
  createSubject,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(updateSubjectRules),
  updateSubject,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deactivateSubject,
);

module.exports = router;
