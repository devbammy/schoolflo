const { Fees, Payment } = require('../models/Fees');
const User = require('../models/User');
const {
  sendSuccess,
  sendError,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const audit = require('../services/auditService');
const { buildFeeLedger } = require('../services/feeLedgerService');
const { isBilledFor, sessionStart } = require('../utils/enrolment');
const { TERMS } = require('../config/constants');
const {
  initializePaystack,
  initializeFlutterwave,
  generateReceiptNumber,
  resolvePayableAmount,
  getFeeBalances,
  settlePayment,
  sendReceiptEmail,
} = require('../services/paymentService');

// @desc    Create fee structure for a class/term
// @route   POST /api/v1/fees
// @access  Admin
const createFeeStructure = async (req, res) => {
  const fee = await Fees.create({ ...req.body, createdBy: req.user._id });

  await audit.record(req, {
    action: 'fee.create',
    entity: 'Fees',
    entityId: fee._id,
    entityLabel: fee.title,
    meta: {
      totalAmount: fee.totalAmount,
      class: fee.class,
      term: fee.term,
      academicYear: fee.academicYear,
    },
  });

  return sendSuccess(res, 201, 'Fee structure created', { fee });
};

// @desc    Get all fee structures
// @route   GET /api/v1/fees
// @access  Admin, Teacher
const getFeeStructures = async (req, res) => {
  const { term, academicYear, classId } = req.query;
  const filter = { isActive: true };
  if (term) filter.term = term;
  if (academicYear) filter.academicYear = academicYear;
  if (classId) filter.class = classId;

  const fees = await Fees.find(filter)
    .populate('class', 'name level')
    .sort({ createdAt: -1 });
  return sendSuccess(res, 200, 'Fee structures fetched', {
    fees,
    count: fees.length,
  });
};

/**
 * Who is allowed to act on a given student's fees.
 * Returns an error message, or null when the request is permitted.
 */
const checkStudentAccess = (user, studentId, action = 'act on') => {
  if (user.role === 'Admin') return null;

  if (user.role === 'Student') {
    return String(user._id) === String(studentId)
      ? null
      : `You can only ${action} your own fees.`;
  }

  if (user.role === 'Parent') {
    const childIds = user.parentProfile?.children?.map(String) || [];
    return childIds.includes(String(studentId))
      ? null
      : `You can only ${action} your own children's fees.`;
  }

  return 'You are not permitted to make payments.';
};

// @desc    Outstanding balance per fee, split by how the money arrived
// @route   GET /api/v1/payments/balance/:studentId
// @access  Admin, Student (own), Parent (own child)
//
// The authority on what a student still owes. A fee may be settled in
// instalments — part online, the rest in cash at the office — so no single
// payment document answers it: a ₦20,000 part-payment is a fully settled
// document of its own against a fee that is still ₦25,000 short.
const getStudentFeeBalances = async (req, res) => {
  const { studentId } = req.params;
  const { term, academicYear } = req.query;

  const denied = checkStudentAccess(req.user, studentId, 'view');
  if (denied) return sendError(res, 403, denied);

  const student = await User.findById(studentId).select(
    'studentProfile.class studentProfile.enrolments studentProfile.profileStatus',
  );
  if (!student) return sendError(res, 404, 'Student not found');

  // Asking about one named fee answers it directly. The office records cash
  // against whichever fee is in front of them, which is not always one of the
  // student's current class/term ones.
  let fees;
  let earlierFees = [];

  if (req.query.feeStructureId) {
    fees = await Fees.find({
      isActive: true,
      _id: req.query.feeStructureId,
    }).sort({ dueDate: 1 });
  } else {
    // Which fees apply depends on where the student was in each session, not
    // only on where they are now. Reading the current class alone made a
    // promoted child's unpaid fees vanish from this page. Anything they have
    // paid towards is included as well, so a receipt always has a fee behind it.
    const profile = student.studentProfile || {};
    const classIds = [
      profile.class,
      ...(profile.enrolments || []).map((e) => e.class),
    ].filter(Boolean);
    const paidFeeIds = await Payment.distinct('feeStructure', {
      student: studentId,
      amountPaid: { $gt: 0 },
    });

    const candidates = await Fees.find({
      isActive: true,
      $or: [{ class: { $in: classIds } }, { _id: { $in: paidFeeIds } }],
    }).sort({ dueDate: 1 });

    const paidIds = new Set(paidFeeIds.map(String));
    const applicable = candidates.filter(
      (fee) => isBilledFor(student, fee) || paidIds.has(String(fee._id)),
    );

    const termOrder = Object.values(TERMS);
    const isEarlier = (fee) => {
      if (!academicYear) return false;
      const difference =
        sessionStart(fee.academicYear) - sessionStart(academicYear);
      if (difference !== 0) return difference < 0;
      return (
        Boolean(term) && termOrder.indexOf(fee.term) < termOrder.indexOf(term)
      );
    };

    fees = applicable.filter(
      (fee) =>
        (!term || fee.term === term) &&
        (!academicYear || fee.academicYear === academicYear),
    );
    earlierFees = applicable.filter(isEarlier);
  }

  const balances = await getFeeBalances(studentId, fees);

  // The pages ask about one term, so without this a debt from a previous term
  // would only be found by someone who thought to go back and look.
  const arrears = (await getFeeBalances(studentId, earlierFees)).filter(
    (balance) => balance.outstanding > 0,
  );

  const totals = balances.reduce(
    (acc, b) => ({
      totalAmount: acc.totalAmount + b.totalAmount,
      paidOnline: acc.paidOnline + b.paidOnline,
      paidOffline: acc.paidOffline + b.paidOffline,
      paidTotal: acc.paidTotal + b.paidTotal,
      outstanding: acc.outstanding + b.outstanding,
    }),
    {
      totalAmount: 0,
      paidOnline: 0,
      paidOffline: 0,
      paidTotal: 0,
      outstanding: 0,
    },
  );

  return sendSuccess(res, 200, 'Fee balances fetched', {
    balances,
    totals,
    arrears,
    arrearsTotal: arrears.reduce((sum, b) => sum + b.outstanding, 0),
  });
};

// @desc    Initialize payment via Paystack
// @route   POST /api/v1/payments/initialize/paystack
// @access  Student (own), Parent (own child), Admin
const initPaystack = async (req, res) => {
  const { studentId, feeStructureId, amount } = req.body;

  const denied = checkStudentAccess(req.user, studentId);
  if (denied) return sendError(res, 403, denied);

  const student = await User.findById(studentId).select(
    'firstName lastName email',
  );
  if (!student) return sendError(res, 404, 'Student not found');

  const feeStructure = await Fees.findById(feeStructureId).populate(
    'class',
    'name',
  );
  if (!feeStructure) return sendError(res, 404, 'Fee structure not found');

  // The server decides what is owed and what may be sent to the gateway.
  // Any `amount` in the request body is treated only as a part-payment
  // request, and is rejected if it exceeds the outstanding balance.
  const { amount: payableAmount, outstanding } = await resolvePayableAmount({
    studentId,
    feeStructure,
    requestedAmount: amount,
  });

  const { authorizationUrl, reference } = await initializePaystack({
    email: student.email,
    amount: payableAmount,
    metadata: {
      studentId,
      feeStructureId,
      studentName: `${student.firstName} ${student.lastName}`,
      term: feeStructure.term,
      academicYear: feeStructure.academicYear,
    },
  });

  // Create a pending payment record
  await Payment.create({
    student: studentId,
    feeStructure: feeStructureId,
    term: feeStructure.term,
    academicYear: feeStructure.academicYear,
    amountPaid: 0,
    amountDue: payableAmount,
    gateway: 'Paystack',
    transactionRef: reference,
    status: 'Pending',
    processedBy: req.user._id,
  });

  return sendSuccess(res, 200, 'Payment initialized', {
    authorizationUrl,
    reference,
    amount: payableAmount,
    outstanding,
  });
};

// @desc    Verify Paystack payment (browser redirect path)
// @route   POST /api/v1/payments/verify/paystack
// @access  Student, Parent, Admin
//
// Best-effort confirmation for the payer who made it back to the site. The
// webhook at POST /webhooks/paystack is the authoritative path — both call the
// same idempotent settlePayment(), so whichever arrives first wins and the
// second is a no-op.
const verifyPaystackPayment = async (req, res) => {
  const { reference } = req.body;
  if (!reference) return sendError(res, 400, 'Payment reference is required');

  // Establish who the reference belongs to before touching it, so a leaked
  // reference cannot be used to probe another family's fee records.
  const existing = await Payment.findOne({ transactionRef: reference }).select(
    'student',
  );
  if (!existing) return sendError(res, 404, 'Payment record not found');

  const denied = checkStudentAccess(req.user, existing.student);
  if (denied) return sendError(res, 403, denied);

  const { settled, reason, payment, overpaid, alreadySettled } =
    await settlePayment({
      reference,
    });

  if (!settled) {
    if (reason === 'currency_mismatch') {
      return sendError(res, 400, 'Payment was made in an unsupported currency');
    }
    return sendError(res, 400, 'Payment has not been completed');
  }

  // Only when this call is the one that settled it. If the webhook got there
  // first it has already been recorded, and another entry would read as money
  // arriving twice.
  if (!alreadySettled) {
    await audit.record(req, {
      action: 'payment.settle',
      entity: 'Payment',
      entityId: payment._id,
      entityLabel: payment.receiptNumber,
      subject: payment.student?._id || existing.student,
      meta: {
        reference,
        amountPaid: payment.amountPaid,
        status: payment.status,
        balance: payment.balance,
        gateway: payment.gateway,
        viaRedirect: true,
        overpaid: overpaid || undefined,
      },
    });
  }

  return sendSuccess(res, 200, 'Payment verified and confirmed', { payment });
};

// @desc    Initialize Flutterwave payment
// @route   POST /api/v1/payments/initialize/flutterwave
// @access  Student (own), Parent (own child), Admin
const initFlutterwave = async (req, res) => {
  const { studentId, feeStructureId, amount } = req.body;

  const denied = checkStudentAccess(req.user, studentId);
  if (denied) return sendError(res, 403, denied);

  const student = await User.findById(studentId).select(
    'firstName lastName email phone',
  );
  if (!student) return sendError(res, 404, 'Student not found');

  const feeStructure = await Fees.findById(feeStructureId);
  if (!feeStructure) return sendError(res, 404, 'Fee structure not found');

  const { amount: payableAmount, outstanding } = await resolvePayableAmount({
    studentId,
    feeStructure,
    requestedAmount: amount,
  });

  const { authorizationUrl, reference } = await initializeFlutterwave({
    email: student.email,
    amount: payableAmount,
    name: `${student.firstName} ${student.lastName}`,
    phone: student.phone,
    metadata: { studentId, feeStructureId },
  });

  await Payment.create({
    student: studentId,
    feeStructure: feeStructureId,
    term: feeStructure.term,
    academicYear: feeStructure.academicYear,
    amountPaid: 0,
    amountDue: payableAmount,
    gateway: 'Flutterwave',
    transactionRef: reference,
    status: 'Pending',
    processedBy: req.user._id,
  });

  return sendSuccess(res, 200, 'Payment initialized', {
    authorizationUrl,
    reference,
    amount: payableAmount,
    outstanding,
  });
};

// @desc    Record manual/cash payment
// @route   POST /api/v1/payments/manual
// @access  Admin
const recordManualPayment = async (req, res) => {
  const { studentId, feeStructureId, amountPaid, gateway, notes } = req.body;

  const feeStructure = await Fees.findById(feeStructureId);
  if (!feeStructure) return sendError(res, 404, 'Fee structure not found');

  // The office may only take what is still owed *after everything already
  // received*, online included. Without this, a parent who had paid ₦20,000
  // by card could hand over the full ₦45,000 in cash and nothing in the
  // system would show the school had been overpaid. The gateway floor does
  // not apply to money crossing a counter.
  const { amount, outstanding } = await resolvePayableAmount({
    studentId,
    feeStructure,
    requestedAmount: amountPaid,
    enforceMinimum: false,
  });

  const remainingAfter = outstanding - amount;

  // Only ever accumulate onto another over-the-counter record. Matching any
  // payment for this student and fee would let a cash entry attach itself to
  // a pending Paystack record, whose transactionRef the gateway would later
  // settle — overwriting the cash amount recorded here.
  // Matched on the SAME method. This used to match either Cash or Bank
  // Transfer, so a transfer recorded after a cash payment was folded into the
  // cash record and took its label — and the report's "by method" totals
  // credited the school's bank account to the till. Each method keeps its own
  // record; balances sum across all of them, so what is owed is unaffected.
  const method = gateway || 'Cash';
  const existing = await Payment.findOne({
    student: studentId,
    feeStructure: feeStructureId,
    gateway: method,
  });

  // What this record is answerable for: the cash it has taken, plus whatever
  // of the fee is still unpaid. Charging it the whole fee would double-count
  // the part already settled online — and leave it stuck on Partial even
  // after the family had paid everything.
  // Each sum handed over gets its own number. Reusing the record's first one
  // gave every instalment of a fee the same receipt, so two pieces of paper for
  // different amounts could not be told apart in a dispute.
  const receiptNumber = await generateReceiptNumber();
  const now = new Date();
  const instalment = {
    amount,
    receiptNumber,
    date: now,
    processedBy: req.user._id,
    notes,
  };

  let payment;
  if (existing) {
    // A record from before instalments were kept: what it already holds becomes
    // the first entry, so the list always adds up to amountPaid.
    if (!existing.instalments?.length && existing.amountPaid > 0) {
      existing.instalments = [
        {
          amount: existing.amountPaid,
          receiptNumber: existing.receiptNumber,
          date: existing.paymentDate,
          processedBy: existing.processedBy,
          notes: existing.notes,
        },
      ];
    }

    existing.instalments.push(instalment);
    existing.paymentDate = now;
    existing.amountPaid += amount;
    existing.amountDue = existing.amountPaid + remainingAfter;
    // Appended, not replaced: this record accumulates several receipts, and
    // overwriting lost the earlier notes (or blanked them when the new entry
    // had none).
    if (notes) {
      existing.notes = [existing.notes, notes].filter(Boolean).join(' | ');
    }
    existing.processedBy = req.user._id;
    existing.receiptNumber = existing.receiptNumber || receiptNumber;
    payment = await existing.save();
  } else {
    payment = await Payment.create({
      student: studentId,
      feeStructure: feeStructureId,
      term: feeStructure.term,
      academicYear: feeStructure.academicYear,
      amountPaid: amount,
      amountDue: amount + remainingAfter,
      gateway: method,
      receiptNumber,
      instalments: [instalment],
      paymentDate: now,
      processedBy: req.user._id,
      notes,
    });
  }

  await payment.populate([
    { path: 'student', select: 'firstName lastName email' },
    { path: 'feeStructure', select: 'title term' },
  ]);

  await sendReceiptEmail(payment, {
    amount,
    outstanding: remainingAfter,
    receiptNumber,
  });

  await audit.record(req, {
    action: 'payment.manual',
    entity: 'Payment',
    entityId: payment._id,
    entityLabel: receiptNumber,
    subject: studentId,
    meta: {
      amount,
      gateway: payment.gateway,
      status: payment.status,
      balance: payment.balance,
      feeStructure: feeStructureId,
      outstanding: remainingAfter,
      notes,
    },
  });

  return sendSuccess(res, 201, 'Payment recorded', {
    payment,
    outstanding: remainingAfter,
  });
};

// @desc    Get payment history for a student
// @route   GET /api/v1/payments/student/:studentId
// @access  Admin, Student (own), Parent (child)
const getStudentPayments = async (req, res) => {
  const { studentId } = req.params;
  const { term, academicYear } = req.query;

  // The same rule as the balance endpoint. The check here used to name only
  // Student and Parent, so a Teacher — who is neither — fell straight through
  // and could read any student's payments and receipts.
  const denied = checkStudentAccess(req.user, studentId, 'view');
  if (denied) return sendError(res, 403, denied);

  const filter = { student: studentId };
  if (term) filter.term = term;
  if (academicYear) filter.academicYear = academicYear;

  const payments = await Payment.find(filter)
    .populate('feeStructure', 'title totalAmount term academicYear')
    .sort({ createdAt: -1 });

  return sendSuccess(res, 200, 'Payments fetched', { payments });
};

// @desc    Financial overview/report
// @route   GET /api/v1/payments/report
// @access  Admin
const getFinancialReport = async (req, res) => {
  const { term, academicYear, classId } = req.query;

  const matchStage = {};
  if (term) matchStage.term = term;
  if (academicYear) matchStage.academicYear = academicYear;

  // `classId` used to be read off the query string and then ignored, so the
  // class filter on the admin page silently reported the whole school.
  if (classId) {
    const feeIds = await Fees.find({
      class: classId,
      ...(term ? { term } : {}),
      ...(academicYear ? { academicYear } : {}),
    }).distinct('_id');
    matchStage.feeStructure = { $in: feeIds };
  }

  const [ledger, byStatus, byGateway, recent] = await Promise.all([
    // Expected revenue comes from fee structures and enrolment, never from
    // payment attempts — see buildFeeLedger for why.
    buildFeeLedger({ term, academicYear, classId }),
    Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amountPaid' },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { ...matchStage, amountPaid: { $gt: 0 } } },
      {
        $group: {
          _id: '$gateway',
          count: { $sum: 1 },
          amount: { $sum: '$amountPaid' },
        },
      },
    ]),
    Payment.find(matchStage)
      .populate('student', 'firstName lastName')
      .populate('feeStructure', 'title')
      .sort({ createdAt: -1 })
      .limit(10),
  ]);

  // Checkouts that were initialised and never completed. They are deliberately
  // kept — a late webhook for an abandoned-then-completed attempt would lose a
  // real payment — but they are attempts, not debt, so they are reported
  // separately rather than folded into what the school is owed.
  const abandonedAttempts = await Payment.countDocuments({
    ...matchStage,
    amountPaid: 0,
    status: 'Pending',
  });

  return sendSuccess(res, 200, 'Financial report fetched', {
    overview: {
      totalExpected: ledger.billed,
      totalCollected: ledger.collected,
      totalOutstanding: ledger.outstanding,
      collectionRate:
        ledger.billed > 0
          ? parseFloat(((ledger.collected / ledger.billed) * 100).toFixed(1))
          : 0,
      studentsBilled: ledger.studentsBilled,
      studentsOwing: ledger.studentsOwing,
      feeStructures: ledger.structures.length,
      hasStructures: ledger.hasStructures,
      abandonedAttempts,
    },
    byStatus,
    byGateway,
    recentTransactions: recent,
  });
};

// @desc    Get one fee structure
// @route   GET /api/v1/fees/:id
// @access  Any authenticated user
const getFeeStructureById = async (req, res) => {
  const fee = await Fees.findById(req.params.id).populate(
    'class',
    'name level',
  );
  if (!fee) throw AppError.notFound('Fee structure not found');

  return sendSuccess(res, 200, 'Fee structure fetched', { fee });
};

// @desc    Update a fee structure
// @route   PUT /api/v1/fees/:id
// @access  Admin
const updateFeeStructure = async (req, res) => {
  const fee = await Fees.findById(req.params.id);
  if (!fee) throw AppError.notFound('Fee structure not found');

  // Loaded and saved rather than findByIdAndUpdate'd: totalAmount is derived
  // from `items` in a pre('validate') hook, and a query update never runs
  // document hooks. Editing the items through the old route left the stored
  // total at its previous value, so balances, receipts and the financial
  // report all kept using the old fee. It also took the request body whole,
  // so the total, creator and active flag could be set directly.
  const editable = [
    'title',
    'class',
    'term',
    'academicYear',
    'items',
    'dueDate',
    'lateFee',
    'isActive',
  ];

  const before = { totalAmount: fee.totalAmount, dueDate: fee.dueDate };
  editable.forEach((field) => {
    if (req.body[field] !== undefined) fee[field] = req.body[field];
  });

  await fee.save();

  await audit.record(req, {
    action: 'fee.update',
    entity: 'Fees',
    entityId: fee._id,
    entityLabel: fee.title,
    changes: audit.diff(before, {
      totalAmount: fee.totalAmount,
      dueDate: fee.dueDate,
    }),
    meta: { term: fee.term, academicYear: fee.academicYear },
  });

  return sendSuccess(res, 200, 'Fee structure updated', { fee });
};

module.exports = {
  createFeeStructure,
  getFeeStructureById,
  updateFeeStructure,
  getFeeStructures,
  initPaystack,
  verifyPaystackPayment,
  initFlutterwave,
  recordManualPayment,
  getStudentPayments,
  getStudentFeeBalances,
  getFinancialReport,
};
