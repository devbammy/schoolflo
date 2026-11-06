const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getBooks,
  getCategories,
  getBookById,
  createBook,
  updateBook,
  deleteBook,
  borrowBook,
  returnBook,
  renewBook,
  payFine,
  getRecords,
  getMyRecords,
  getOverdue,
  getStats,
} = require('../controllers/libraryController');
const {
  createBookRules,
  borrowBookRules,
  idParam,
} = require('../validators/operationsValidators');
const {
  objectIdParam,
  paginationQuery,
  sortQuery,
} = require('../validators/common');

const recordIdParam = [objectIdParam('recordId', 'Record id')];

// ─── Books ───────────────────────────────────────────────────────────────────
router.get(
  '/books',
  protect,
  validate([...paginationQuery(), ...sortQuery()]),
  getBooks,
);

// Must precede '/books/:id' so 'categories' is never treated as an id.
router.get('/books/categories', protect, getCategories);

router.get('/books/:id', protect, validate(idParam), getBookById);

router.post(
  '/books',
  protect,
  authorize('Admin'),
  validate(createBookRules),
  createBook,
);

router.put(
  '/books/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  updateBook,
);

router.delete(
  '/books/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deleteBook,
);

// ─── Borrowing ───────────────────────────────────────────────────────────────
router.post('/borrow', protect, authorize('Admin', 'Teacher'), borrowBook);

router.post(
  '/return/:recordId',
  protect,
  authorize('Admin', 'Teacher'),
  validate(recordIdParam),
  returnBook,
);

router.post(
  '/renew/:recordId',
  protect,
  authorize('Admin', 'Teacher'),
  validate(recordIdParam),
  renewBook,
);

router.patch(
  '/fine/:recordId/pay',
  protect,
  authorize('Admin'),
  validate(recordIdParam),
  payFine,
);

// ─── Records ─────────────────────────────────────────────────────────────────
router.get(
  '/records',
  protect,
  authorize('Admin', 'Teacher'),
  validate(paginationQuery()),
  getRecords,
);

// Must precede any '/records/:id' style route.
router.get('/records/mine', protect, getMyRecords);

router.get('/overdue', protect, authorize('Admin', 'Teacher'), getOverdue);

router.get('/stats', protect, authorize('Admin', 'Teacher'), getStats);

module.exports = router;
