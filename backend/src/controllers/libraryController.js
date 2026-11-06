const { Book, BorrowRecord } = require('../models/Library');
const User = require('../models/User');
const {
  sendSuccess,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { applySort } = require('../utils/listSort');

const FINE_PER_DAY = 100; // ₦100 per day overdue
const DEFAULT_LOAN_DAYS = 14;
const MAX_RENEWALS = 2;
const RENEWAL_DAYS = 7;

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

const escapeRegex = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Loans past their due date are flagged lazily, whenever records are read.
 * There is no scheduled job, so every read path that reports status has to
 * do this first or overdue books would keep showing as merely 'Borrowed'.
 */
const flagOverdue = (extraFilter = {}) =>
  BorrowRecord.updateMany(
    { ...extraFilter, status: 'Borrowed', dueDate: { $lt: new Date() } },
    { $set: { status: 'Overdue' } },
  );

// ─── Books ───────────────────────────────────────────────────────────────────

// @desc    List books
// @route   GET /api/v1/library/books
// @access  Any authenticated user
const getBooks = async (req, res) => {
  const { search, category, available } = req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = { isActive: true };
  if (category) filter.category = new RegExp(escapeRegex(category), 'i');
  if (available === 'true') filter.availableCopies = { $gt: 0 };

  const fullFilter = search
    ? { ...filter, $text: { $search: search } }
    : filter;

  const [books, total] = await Promise.all([
    // Collated like every other list, except during a $text search, which
    // refuses any collation but the simple one. Without it the whole list
    // sorted by character code, so "arrow of God" landed after every title
    // that starts with a capital.
    applySort(Book.find(fullFilter), req.query.sort, ['title'], {
      collate: !search,
    })
      .populate(BOOK_POPULATE)
      .skip(skip)
      .limit(limit),
    Book.countDocuments(fullFilter),
  ]);

  return sendPaginated(res, books, total, page, limit);
};

// @desc    Distinct book categories
// @route   GET /api/v1/library/books/categories
// @access  Any authenticated user
const getCategories = async (req, res) => {
  const categories = await Book.distinct('category', { isActive: true });
  return sendSuccess(res, 200, 'Categories', { categories: categories.sort() });
};

// @desc    Get one book
// @route   GET /api/v1/library/books/:id
// @access  Any authenticated user
const getBookById = async (req, res) => {
  const book = await Book.findById(req.params.id).populate(BOOK_POPULATE);
  if (!book) throw AppError.notFound('Book not found');

  return sendSuccess(res, 200, 'Book fetched', { book });
};

// @desc    Add a book
// @route   POST /api/v1/library/books
// @access  Admin
const createBook = async (req, res) => {
  const book = await Book.create({ ...req.body, addedBy: req.user._id });
  return sendSuccess(res, 201, 'Book added to library', { book });
};

// @desc    Update a book
// @route   PUT /api/v1/library/books/:id
// @access  Admin
const updateBook = async (req, res) => {
  const { totalCopies, availableCopies, ...rest } = req.body;

  const book = await Book.findById(req.params.id);
  if (!book) throw AppError.notFound('Book not found');

  // Changing the total must not orphan copies that are currently out on loan.
  if (totalCopies !== undefined) {
    const borrowed = book.totalCopies - book.availableCopies;
    book.totalCopies = totalCopies;
    book.availableCopies = Math.max(0, totalCopies - borrowed);
  }

  Object.assign(book, rest);
  await book.save();

  return sendSuccess(res, 200, 'Book updated', { book });
};

// @desc    Soft-delete a book
// @route   DELETE /api/v1/library/books/:id
// @access  Admin
const deleteBook = async (req, res) => {
  const active = await BorrowRecord.countDocuments({
    book: req.params.id,
    status: { $in: ['Borrowed', 'Overdue'] },
  });

  if (active > 0) {
    throw AppError.badRequest(
      `Cannot remove — ${active} copy(copies) currently borrowed`,
    );
  }

  const book = await Book.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!book) throw AppError.notFound('Book not found');

  return sendSuccess(res, 200, 'Book removed from library');
};

// ─── Borrowing ───────────────────────────────────────────────────────────────

// @desc    Issue a book to a borrower
// @route   POST /api/v1/library/borrow
// @access  Admin, Teacher
const borrowBook = async (req, res) => {
  const { bookId, borrowerId, loanDays = DEFAULT_LOAN_DAYS, notes } = req.body;

  const [book, borrower] = await Promise.all([
    Book.findById(bookId),
    User.findById(borrowerId).select('firstName lastName role'),
  ]);

  if (!book || !book.isActive) throw AppError.notFound('Book not found');
  if (!borrower) throw AppError.notFound('Borrower not found');

  // BorrowRecord.borrowerRole only knows Student, Teacher and Staff. An Admin
  // borrower failed with an enum error nobody could act on.
  const borrowerRole = borrower.role === 'Admin' ? 'Staff' : borrower.role;
  if (!['Student', 'Teacher', 'Staff'].includes(borrowerRole)) {
    throw AppError.badRequest(`${borrower.role} accounts cannot borrow books`);
  }

  const existing = await BorrowRecord.findOne({
    book: bookId,
    borrower: borrowerId,
    status: { $in: ['Borrowed', 'Overdue'] },
  });

  if (existing) {
    throw AppError.conflict('This borrower already has a copy of this book');
  }

  const days = parseInt(loanDays, 10) || DEFAULT_LOAN_DAYS;
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + days);

  // Take the copy first, in one atomic step that is also the availability
  // check. Reading `availableCopies` and decrementing it later let two people
  // issuing the last copy at the same moment both succeed.
  const taken = await Book.findOneAndUpdate(
    { _id: bookId, isActive: true, availableCopies: { $gt: 0 } },
    { $inc: { availableCopies: -1 } },
  );
  if (!taken) throw AppError.badRequest('No copies available');

  let record;
  try {
    record = await BorrowRecord.create({
      book: bookId,
      borrower: borrowerId,
      borrowerRole,
      issuedBy: req.user._id,
      dueDate,
      notes,
    });
  } catch (error) {
    // No loan was recorded, so the copy has to go back on the shelf.
    await Book.findByIdAndUpdate(bookId, { $inc: { availableCopies: 1 } });
    throw error;
  }

  await record.populate(BORROW_POPULATE);

  return sendSuccess(res, 201, 'Book issued successfully', { record });
};

// @desc    Return a borrowed book, charging any overdue fine
// @route   POST /api/v1/library/return/:recordId
// @access  Admin, Teacher
const returnBook = async (req, res) => {
  let record = await BorrowRecord.findById(req.params.recordId).populate(
    'book',
  );

  if (!record) throw AppError.notFound('Borrow record not found');
  if (record.status === 'Returned') {
    throw AppError.badRequest('Book already returned');
  }

  let fineAmount = record.fine?.amount || 0;
  if (new Date() > record.dueDate) {
    const daysLate = Math.floor(
      (Date.now() - new Date(record.dueDate)) / (1000 * 60 * 60 * 24),
    );
    fineAmount = daysLate * FINE_PER_DAY;
  }

  // The status change is the gate. Two returns arriving together both passed
  // the "already returned" check above and each put a copy back on the shelf,
  // so the library could end up holding more copies than it owns. Only the
  // request that actually flips the status goes on to add the copy.
  const returned = await BorrowRecord.findOneAndUpdate(
    { _id: record._id, status: { $ne: 'Returned' } },
    {
      $set: {
        returnDate: new Date(),
        returnedTo: req.user._id,
        status: 'Returned',
        'fine.amount': fineAmount,
      },
    },
    { new: true },
  );

  if (!returned) throw AppError.badRequest('Book already returned');

  await Book.findByIdAndUpdate(record.book._id, {
    $inc: { availableCopies: 1 },
  });

  await returned.populate(BORROW_POPULATE);
  record = returned;

  return sendSuccess(res, 200, 'Book returned successfully', {
    record,
    fine: record.fine.amount,
  });
};

// @desc    Extend a loan
// @route   POST /api/v1/library/renew/:recordId
// @access  Admin, Teacher
const renewBook = async (req, res) => {
  const record = await BorrowRecord.findById(req.params.recordId);

  if (!record) throw AppError.notFound('Record not found');
  if (record.status === 'Returned') {
    throw AppError.badRequest('Book already returned');
  }
  if (record.renewalCount >= MAX_RENEWALS) {
    throw AppError.badRequest(`Maximum renewals (${MAX_RENEWALS}) reached`);
  }

  // Extend from the due date when still in date, otherwise from today, so an
  // overdue loan does not get a renewal backdated into the past.
  const base =
    new Date(record.dueDate) > new Date()
      ? new Date(record.dueDate)
      : new Date();
  base.setDate(base.getDate() + RENEWAL_DAYS);

  record.dueDate = base;
  record.renewalCount += 1;
  record.status = 'Borrowed';
  await record.save();

  await record.populate(BORROW_POPULATE);

  return sendSuccess(
    res,
    200,
    `Renewed — new due date ${base.toDateString()}`,
    {
      record,
    },
  );
};

// @desc    Mark a fine as paid
// @route   PATCH /api/v1/library/fine/:recordId/pay
// @access  Admin
const payFine = async (req, res) => {
  const record = await BorrowRecord.findByIdAndUpdate(
    req.params.recordId,
    { 'fine.paid': true, 'fine.paidDate': new Date() },
    { new: true },
  ).populate(BORROW_POPULATE);

  if (!record) throw AppError.notFound('Record not found');

  return sendSuccess(res, 200, 'Fine marked as paid', { record });
};

// ─── Records ─────────────────────────────────────────────────────────────────

// @desc    All borrow records
// @route   GET /api/v1/library/records
// @access  Admin, Teacher
const getRecords = async (req, res) => {
  const { status, borrowerId, bookId } = req.query;
  const { page, limit, skip } = getPaginationParams(req.query);

  const filter = {};
  if (status) filter.status = status;
  if (borrowerId) filter.borrower = borrowerId;
  if (bookId) filter.book = bookId;

  await flagOverdue();

  const [records, total] = await Promise.all([
    BorrowRecord.find(filter)
      .populate(BORROW_POPULATE)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    BorrowRecord.countDocuments(filter),
  ]);

  return sendPaginated(res, records, total, page, limit);
};

// @desc    The caller's own borrow history
// @route   GET /api/v1/library/records/mine
// @access  Any authenticated user
const getMyRecords = async (req, res) => {
  await flagOverdue({ borrower: req.user._id });

  const records = await BorrowRecord.find({ borrower: req.user._id })
    .populate(BORROW_POPULATE)
    .sort({ createdAt: -1 });

  return sendSuccess(res, 200, 'Your borrow history', { records });
};

// @desc    Every overdue loan
// @route   GET /api/v1/library/overdue
// @access  Admin, Teacher
const getOverdue = async (req, res) => {
  await flagOverdue();

  const records = await BorrowRecord.find({ status: 'Overdue' })
    .populate(BORROW_POPULATE)
    .sort({ dueDate: 1 });

  return sendSuccess(res, 200, 'Overdue records', {
    records,
    count: records.length,
  });
};

// @desc    Library dashboard summary
// @route   GET /api/v1/library/stats
// @access  Admin, Teacher
const getStats = async (req, res) => {
  await flagOverdue();

  const [totalBooks, copies, borrowed, overdue, returned, unpaidFines] =
    await Promise.all([
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
    totalCopies: copies[0]?.total || 0,
    availableCopies: copies[0]?.available || 0,
    borrowed,
    overdue,
    returned,
    unpaidFines: unpaidFines[0]?.total || 0,
  });
};

module.exports = {
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
  FINE_PER_DAY,
  DEFAULT_LOAN_DAYS,
};
