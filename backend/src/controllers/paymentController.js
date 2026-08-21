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
const {
  initializePaystack,
  initializeFlutterwave,
  generateReceiptNumber,
  getFinancialSummary,
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

  const student = await User.findById(studentId).select('studentProfile.class');
  if (!student) return sendError(res, 404, 'Student not found');

  // Asking about one named fee answers it directly. The office records cash
  // against whichever fee is in front of them, which is not always one of the
  // student's current class/term ones.
  const filter = { isActive: true };
  if (req.query.feeStructureId) {
    filter._id = req.query.feeStructureId;
  } else {
    if (term) filter.term = term;
    if (academicYear) filter.academicYear = academicYear;
    if (student.studentProfile?.class)
      filter.class = student.studentProfile.class;
  }

  const fees = await Fees.find(filter).sort({ dueDate: 1 });
  const balances = await getFeeBalances(studentId, fees);

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

  return sendSuccess(res, 200, 'Fee balances fetched', { balances, totals });
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

  const { settled, reason, payment } = await settlePayment({ reference });

  if (!settled) {
    if (reason === 'currency_mismatch') {
      return sendError(res, 400, 'Payment was made in an unsupported currency');
    }
    return sendError(res, 400, 'Payment has not been completed');
  }

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
    },
  });

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
  const existing = await Payment.findOne({
    student: studentId,
    feeStructure: feeStructureId,
    gateway: { $in: ['Cash', 'Bank Transfer'] },
  });

  // What this record is answerable for: the cash it has taken, plus whatever
  // of the fee is still unpaid. Charging it the whole fee would double-count
  // the part already settled online — and leave it stuck on Partial even
  // after the family had paid everything.
  let payment;
  if (existing) {
    existing.amountPaid += amount;
    existing.amountDue = existing.amountPaid + remainingAfter;
    existing.notes = notes;
    existing.processedBy = req.user._id;
    existing.receiptNumber =
      existing.receiptNumber || (await generateReceiptNumber());
    payment = await existing.save();
  } else {
    payment = await Payment.create({
      student: studentId,
      feeStructure: feeStructureId,
      term: feeStructure.term,
      academicYear: feeStructure.academicYear,
      amountPaid: amount,
      amountDue: amount + remainingAfter,
      gateway: gateway || 'Cash',
      receiptNumber: await generateReceiptNumber(),
      processedBy: req.user._id,
      notes,
    });
  }

  await payment.populate([
    { path: 'student', select: 'firstName lastName email' },
    { path: 'feeStructure', select: 'title term' },
  ]);

  await sendReceiptEmail(payment, { amount, outstanding: remainingAfter });

  await audit.record(req, {
    action: 'payment.manual',
    entity: 'Payment',
    entityId: payment._id,
    entityLabel: payment.receiptNumber,
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

  // Auth checks
  if (req.user.role === 'Student' && String(req.user._id) !== studentId) {
    return sendError(res, 403, 'Access denied');
  }
  if (req.user.role === 'Parent') {
    const childIds = req.user.parentProfile?.children?.map(String) || [];
    if (!childIds.includes(studentId))
      return sendError(res, 403, 'Access denied');
  }

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

  const [overview, byStatus, byGateway, recent] = await Promise.all([
    Payment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalExpected: { $sum: '$amountDue' },
          totalCollected: { $sum: '$amountPaid' },
          totalOutstanding: { $sum: '$balance' },
          count: { $sum: 1 },
        },
      },
    ]),
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
      { $match: { ...matchStage, status: 'Paid' } },
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

  return sendSuccess(res, 200, 'Financial report fetched', {
    overview: overview[0] || {},
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
  const fee = await Fees.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });

  if (!fee) throw AppError.notFound('Fee structure not found');

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
