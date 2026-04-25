const mongoose = require('mongoose');

// ── Book Model ────────────────────────────────────────────────────────────────
const BookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Book title is required'],
      trim: true,
    },
    author: {
      type: String,
      required: [true, 'Author is required'],
      trim: true,
    },
    isbn: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      // e.g. 'Mathematics', 'Fiction', 'Science', 'Reference'
    },
    publisher: { type: String, trim: true },
    publishYear: { type: Number },
    edition: { type: String, trim: true },
    language: { type: String, default: 'English' },
    description: { type: String, trim: true },
    coverImage: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    totalCopies: {
      type: Number,
      required: true,
      min: [1, 'Must have at least 1 copy'],
      default: 1,
    },
    availableCopies: {
      type: Number,
      default: function () {
        return this.totalCopies;
      },
    },
    shelf: { type: String, trim: true, default: '' }, // physical location
    isActive: { type: Boolean, default: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

BookSchema.virtual('isAvailable').get(function () {
  return this.availableCopies > 0;
});

BookSchema.index({ title: 'text', author: 'text', isbn: 'text' });
BookSchema.index({ category: 1 });
BookSchema.index({ availableCopies: 1 });

const Book = mongoose.model('Book', BookSchema);

// ── BorrowRecord Model ────────────────────────────────────────────────────────
const BorrowRecordSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    borrowerRole: {
      type: String,
      enum: ['Student', 'Teacher', 'Staff'],
      required: true,
    },
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    returnDate: {
      type: Date,
      default: null,
    },
    returnedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    status: {
      type: String,
      enum: ['Borrowed', 'Returned', 'Overdue', 'Lost'],
      default: 'Borrowed',
    },
    renewalCount: {
      type: Number,
      default: 0,
      max: 2, // max 2 renewals
    },
    fine: {
      amount: { type: Number, default: 0 },
      paid: { type: Boolean, default: false },
      paidDate: { type: Date, default: null },
    },
    notes: { type: String, trim: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

BorrowRecordSchema.virtual('isOverdue').get(function () {
  if (this.status === 'Returned') return false;
  return new Date() > this.dueDate;
});

BorrowRecordSchema.virtual('daysOverdue').get(function () {
  if (!this.isOverdue) return 0;
  const diff = Date.now() - new Date(this.dueDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

// Auto-update status to Overdue on read
BorrowRecordSchema.pre('save', function (next) {
  if (this.status === 'Borrowed' && new Date() > this.dueDate) {
    this.status = 'Overdue';
  }
  next();
});

BorrowRecordSchema.index({ borrower: 1, status: 1 });
BorrowRecordSchema.index({ book: 1, status: 1 });
BorrowRecordSchema.index({ dueDate: 1, status: 1 });
BorrowRecordSchema.index({ status: 1 });

const BorrowRecord = mongoose.model('BorrowRecord', BorrowRecordSchema);

module.exports = { Book, BorrowRecord };
