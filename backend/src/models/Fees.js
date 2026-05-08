const mongoose = require('mongoose');
const { PAYMENT_STATUS, PAYMENT_GATEWAY } = require('../config/constants');

// ─── FEE STRUCTURE MODEL ──────────────────────────────────────────────────────
const FeeItemSchema = new mongoose.Schema(
  {
    label: { type: String, required: true }, // e.g., "Tuition", "Books", "Uniform"
    amount: { type: Number, required: true, min: 0 },
    isCompulsory: { type: Boolean, default: true },
  },
  { _id: false },
);

const FeesSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Fee title is required'],
      trim: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
      required: true,
    },
    term: {
      type: String,
      required: true,
      enum: ['First Term', 'Second Term', 'Third Term'],
    },
    academicYear: {
      type: String,
      required: true,
    },
    items: [FeeItemSchema],
    totalAmount: {
      type: Number,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    lateFee: {
      type: Number,
      default: 0,
    },
    isActive: { type: Boolean, default: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  },
);

// Auto-calculate total from items
FeesSchema.pre('save', function (next) {
  if (this.isModified('items')) {
    this.totalAmount = this.items.reduce((sum, item) => sum + item.amount, 0);
  }
  next();
});

FeesSchema.index({ class: 1, term: 1, academicYear: 1 }, { unique: true });

const Fees = mongoose.model('Fees', FeesSchema);

// ─── PAYMENT TRANSACTION MODEL ────────────────────────────────────────────────
const PaymentSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    feeStructure: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Fees',
      required: true,
    },
    term: {
      type: String,
      required: true,
    },
    academicYear: {
      type: String,
      required: true,
    },
    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
    amountDue: {
      type: Number,
      required: true,
    },
    balance: {
      type: Number,
      default: function () {
        return this.amountDue - this.amountPaid;
      },
    },
    status: {
      type: String,
      enum: Object.values(PAYMENT_STATUS),
      default: PAYMENT_STATUS.PENDING,
    },
    gateway: {
      type: String,
      enum: Object.values(PAYMENT_GATEWAY),
      default: PAYMENT_GATEWAY.CASH,
    },
    transactionRef: {
      type: String,
      unique: true,
      sparse: true,
    },
    gatewayResponse: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
    paymentDate: {
      type: Date,
      default: Date.now,
    },
    receiptNumber: {
      type: String,
      unique: true,
      sparse: true,
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    notes: String,
  },
  {
    timestamps: true,
  },
);

// Auto-compute balance and status
PaymentSchema.pre('save', function (next) {
  this.balance = this.amountDue - this.amountPaid;
  if (this.amountPaid >= this.amountDue) {
    this.status = PAYMENT_STATUS.PAID;
    this.balance = 0;
  } else if (this.amountPaid > 0) {
    this.status = PAYMENT_STATUS.PARTIAL;
  } else {
    this.status = PAYMENT_STATUS.PENDING;
  }
  next();
});

PaymentSchema.index({ student: 1, term: 1, academicYear: 1 });
PaymentSchema.index({ status: 1 });

const Payment = mongoose.model('Payment', PaymentSchema);

module.exports = { Fees, Payment };
