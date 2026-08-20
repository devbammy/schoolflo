const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getParents,
  createParent,
  updateParent,
  linkChild,
  deleteParent,
  getUnlinkedStudents,
  getChildrenAssignments,
} = require('../controllers/parentController');
const {
  createParentRules,
  updateParentRules,
  linkChildRules,
  idParam,
} = require('../validators/academicValidators');
const { paginationQuery } = require('../validators/common');

// Static paths first, so 'students' and 'children' are never read as an :id.
router.get(
  '/students/unlinked',
  protect,
  authorize('Admin'),
  getUnlinkedStudents,
);

router.get(
  '/children/assignments',
  protect,
  authorize('Parent'),
  getChildrenAssignments,
);

router.get(
  '/',
  protect,
  authorize('Admin'),
  validate(paginationQuery()),
  getParents,
);

router.post(
  '/',
  protect,
  authorize('Admin'),
  validate(createParentRules),
  createParent,
);

router.put(
  '/:id',
  protect,
  authorize('Admin'),
  validate(updateParentRules),
  updateParent,
);

router.patch(
  '/:id/children',
  protect,
  authorize('Admin'),
  validate(linkChildRules),
  linkChild,
);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deleteParent,
);

module.exports = router;
