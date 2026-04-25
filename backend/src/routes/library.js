const express = require('express');
const router = express.Router();
const { Book, BorrowRecord } = require('../models/Library');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const {
  sendSuccess,
  sendError,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');

const FINE_PER_DAY = 100; // ₦50 per day overdue
const DEFAULT_LOAN_DAYS = 14;

const BOOK_POPULATE = [{ path: 'addedBy', select: 'firstName lastName' }];
const BORROW_POPULATE = [
  { path: 'book', select: 'title author isbn category coverImage' },
  {
    path: 'borrower',
    select: 'firstName lastName role studentProfile teacherProfile avatar',
  },
  { path: 'issuedBy', select: 'firstName lastName' },
  { path: 'returnedTo', select: 'firstName lastName' },
];

// ─────────────────────────────────────────────────────────────────────────────
// BOOKS
// ─────────────────────────────────────────────────────────────────────────────

// GET /library/books
router.get('/books', protect, async (req, res) => {
  try {
    const { search, category, available, page = 1, limit = 20 } = req.query;
    const { skip } = getPaginationParams({ page, limit });

    const filter = { isActive: true };
    if (category) filter.category = new RegExp(category, 'i');
    if (available === 'true') filter.availableCopies = { $gt: 0 };

    // Text search on title / author / isbn
    let query;
    if (search) {
      query = Book.find({ ...filter, $text: { $search: search } });
    } else {
      query = Book.find(filter);
    }

    const [books, total] = await Promise.all([
      query
        .populate(BOOK_POPULATE)
        .sort({ title: 1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Book.countDocuments(
        search ? { ...filter, $text: { $search: search } } : filter,
      ),
    ]);

    return sendPaginated(res, books, total, page, limit);
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// GET /library/books/categories — distinct category list
router.get('/books/categories', protect, async (req, res) => {
  try {
    const cats = await Book.distinct('category', { isActive: true });
    return sendSuccess(res, 200, 'Categories', { categories: cats.sort() });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// GET /library/books/:id
router.get('/books/:id', protect, async (req, res) => {
  try {
    const book = await Book.findById(req.params.id).populate(BOOK_POPULATE);
    if (!book) return sendError(res, 404, 'Book not found');
    return sendSuccess(res, 200, 'Book fetched', { book });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// POST /library/books
router.post('/books', protect, authorize('Admin'), async (req, res) => {
  try {
    const book = await Book.create({ ...req.body, addedBy: req.user._id });
    return sendSuccess(res, 201, 'Book added to library', { book });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// PUT /library/books/:id
router.put('/books/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    const { totalCopies, availableCopies, ...rest } = req.body;
    const book = await Book.findById(req.params.id);
    if (!book) return sendError(res, 404, 'Book not found');

    // Recalculate availableCopies if totalCopies changed
    if (totalCopies !== undefined) {
      const borrowed = book.totalCopies - book.availableCopies;
      book.totalCopies = totalCopies;
      book.availableCopies = Math.max(0, totalCopies - borrowed);
    }
    Object.assign(book, rest);
    await book.save();
    return sendSuccess(res, 200, 'Book updated', { book });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// DELETE /library/books/:id  (soft delete)
router.delete('/books/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    // Block if copies are currently out
    const active = await BorrowRecord.countDocuments({
      book: req.params.id,
      status: { $in: ['Borrowed', 'Overdue'] },
    });
    if (active > 0)
      return sendError(
        res,
        400,
        `Cannot remove — ${active} copy(copies) currently borrowed`,
      );
    await Book.findByIdAndUpdate(req.params.id, { isActive: false });
    return sendSuccess(res, 200, 'Book removed from library');
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// BORROW / ISSUE
// ─────────────────────────────────────────────────────────────────────────────

// POST /library/borrow  — issue a book to a user
router.post(
  '/borrow',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const {
        bookId,
        borrowerId,
        loanDays = DEFAULT_LOAN_DAYS,
        notes,
      } = req.body;

      const [book, borrower] = await Promise.all([
        Book.findById(bookId),
        User.findById(borrowerId).select('firstName lastName role'),
      ]);

      if (!book) return sendError(res, 404, 'Book not found');
      if (!borrower) return sendError(res, 404, 'Borrower not found');
      if (book.availableCopies < 1)
        return sendError(res, 400, 'No copies available');

      // Check borrower does not already have this book
      const existing = await BorrowRecord.findOne({
        book: bookId,
        borrower: borrowerId,
        status: { $in: ['Borrowed', 'Overdue'] },
      });
      if (existing)
        return sendError(
          res,
          400,
          'This borrower already has a copy of this book',
        );

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + parseInt(loanDays));

      const record = await BorrowRecord.create({
        book: bookId,
        borrower: borrowerId,
        borrowerRole: borrower.role,
        issuedBy: req.user._id,
        dueDate,
        notes,
      });

      // Decrement available copies
      book.availableCopies -= 1;
      await book.save();

      await record.populate(BORROW_POPULATE);
      return sendSuccess(res, 201, 'Book issued successfully', { record });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// POST /library/return/:recordId  — return a book
router.post(
  '/return/:recordId',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const record = await BorrowRecord.findById(req.params.recordId).populate(
        'book',
      );
      if (!record) return sendError(res, 404, 'Borrow record not found');
      if (record.status === 'Returned')
        return sendError(res, 400, 'Book already returned');

      record.returnDate = new Date();
      record.returnedTo = req.user._id;
      record.status = 'Returned';

      // Calculate fine if overdue
      if (new Date() > record.dueDate) {
        const daysLate = Math.floor(
          (Date.now() - new Date(record.dueDate)) / (1000 * 60 * 60 * 24),
        );
        record.fine.amount = daysLate * FINE_PER_DAY;
      }

      await record.save();

      // Increment available copies
      await Book.findByIdAndUpdate(record.book._id, {
        $inc: { availableCopies: 1 },
      });

      await record.populate(BORROW_POPULATE);
      return sendSuccess(res, 200, 'Book returned successfully', {
        record,
        fine: record.fine.amount,
      });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// POST /library/renew/:recordId  — extend due date by 7 days (max 2 renewals)
router.post(
  '/renew/:recordId',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const record = await BorrowRecord.findById(req.params.recordId);
      if (!record) return sendError(res, 404, 'Record not found');
      if (record.status === 'Returned')
        return sendError(res, 400, 'Book already returned');
      if (record.renewalCount >= 2)
        return sendError(res, 400, 'Maximum renewals (2) reached');

      const base =
        new Date(record.dueDate) > new Date()
          ? new Date(record.dueDate)
          : new Date();
      base.setDate(base.getDate() + 7);
      record.dueDate = base;
      record.renewalCount += 1;
      record.status = 'Borrowed';
      await record.save();

      await record.populate(BORROW_POPULATE);
      return sendSuccess(
        res,
        200,
        `Renewed — new due date ${base.toDateString()}`,
        { record },
      );
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// PATCH /library/fine/:recordId/pay  — mark fine as paid
router.patch(
  '/fine/:recordId/pay',
  protect,
  authorize('Admin'),
  async (req, res) => {
    try {
      const record = await BorrowRecord.findByIdAndUpdate(
        req.params.recordId,
        { 'fine.paid': true, 'fine.paidDate': new Date() },
        { new: true },
      ).populate(BORROW_POPULATE);
      if (!record) return sendError(res, 404, 'Record not found');
      return sendSuccess(res, 200, 'Fine marked as paid', { record });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// ─────────────────────────────────────────────────────────────────────────────
// QUERY RECORDS
// ─────────────────────────────────────────────────────────────────────────────

// GET /library/records  — all borrow records (admin)
router.get(
  '/records',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      const { status, borrowerId, bookId, page = 1, limit = 20 } = req.query;
      const { skip } = getPaginationParams({ page, limit });

      const filter = {};
      if (status) filter.status = status;
      if (borrowerId) filter.borrower = borrowerId;
      if (bookId) filter.book = bookId;

      // Auto-flag overdue
      await BorrowRecord.updateMany(
        { status: 'Borrowed', dueDate: { $lt: new Date() } },
        { $set: { status: 'Overdue' } },
      );

      const [records, total] = await Promise.all([
        BorrowRecord.find(filter)
          .populate(BORROW_POPULATE)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit)),
        BorrowRecord.countDocuments(filter),
      ]);

      return sendPaginated(res, records, total, page, limit);
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// GET /library/records/mine  — current user's borrow history
router.get('/records/mine', protect, async (req, res) => {
  try {
    await BorrowRecord.updateMany(
      {
        borrower: req.user._id,
        status: 'Borrowed',
        dueDate: { $lt: new Date() },
      },
      { $set: { status: 'Overdue' } },
    );
    const records = await BorrowRecord.find({ borrower: req.user._id })
      .populate(BORROW_POPULATE)
      .sort({ createdAt: -1 });
    return sendSuccess(res, 200, 'Your borrow history', { records });
  } catch (err) {
    return sendError(res, 500, err.message);
  }
});

// GET /library/overdue  — all overdue records
router.get(
  '/overdue',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      await BorrowRecord.updateMany(
        { status: 'Borrowed', dueDate: { $lt: new Date() } },
        { $set: { status: 'Overdue' } },
      );
      const records = await BorrowRecord.find({ status: 'Overdue' })
        .populate(BORROW_POPULATE)
        .sort({ dueDate: 1 });
      return sendSuccess(res, 200, 'Overdue records', {
        records,
        count: records.length,
      });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

// GET /library/stats  — dashboard summary
router.get(
  '/stats',
  protect,
  authorize('Admin', 'Teacher'),
  async (req, res) => {
    try {
      await BorrowRecord.updateMany(
        { status: 'Borrowed', dueDate: { $lt: new Date() } },
        { $set: { status: 'Overdue' } },
      );

      const [
        totalBooks,
        totalCopies,
        borrowed,
        overdue,
        returned,
        unpaidFines,
      ] = await Promise.all([
        Book.countDocuments({ isActive: true }),
        Book.aggregate([
          {
            $group: {
              _id: null,
              total: { $sum: '$totalCopies' },
              available: { $sum: '$availableCopies' },
            },
          },
        ]),
        BorrowRecord.countDocuments({ status: 'Borrowed' }),
        BorrowRecord.countDocuments({ status: 'Overdue' }),
        BorrowRecord.countDocuments({ status: 'Returned' }),
        BorrowRecord.aggregate([
          { $match: { 'fine.amount': { $gt: 0 }, 'fine.paid': false } },
          { $group: { _id: null, total: { $sum: '$fine.amount' } } },
        ]),
      ]);

      return sendSuccess(res, 200, 'Library stats', {
        totalBooks,
        totalCopies: totalCopies[0]?.total || 0,
        availableCopies: totalCopies[0]?.available || 0,
        borrowed,
        overdue,
        returned,
        unpaidFines: unpaidFines[0]?.total || 0,
      });
    } catch (err) {
      return sendError(res, 500, err.message);
    }
  },
);

module.exports = router;
