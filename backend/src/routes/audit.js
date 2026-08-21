const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getAuditLog,
  getEntityHistory,
  getStudentHistory,
  getActions,
  getSummary,
} = require('../controllers/auditController');
const { objectIdParam, paginationQuery } = require('../validators/common');

// Read-only by design. There is no route here that creates, edits or deletes
// an entry — the log is written by the actions it records, and nothing else.
router.use(protect, authorize('Admin'));

// Static paths first, so 'actions' and 'summary' are never read as an id.
router.get('/actions', getActions);
router.get('/summary', getSummary);

router.get(
  '/student/:studentId',
  validate([objectIdParam('studentId', 'Student id')]),
  getStudentHistory,
);

router.get(
  '/entity/:entity/:entityId',
  validate([objectIdParam('entityId', 'Entity id')]),
  getEntityHistory,
);

router.get('/', validate(paginationQuery()), getAuditLog);

module.exports = router;
