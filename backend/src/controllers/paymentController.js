const { Fees, Payment } = require('../models/Fees');
const User = require('../models/User');
const {
  sendSuccess,
  sendError,
  sendPaginated,
  getPaginationParams,
} = require('../utils/apiResponse');
const {
  initializePaystack,
  verifyPaystack,
  initializeFlutterwave,
  verifyFlutterwave,
  generateReceiptNumber,
  getFinancialSummary,
} = require('../services/paymentService');
const {
  sendEmail,
  emailTemplates,
} = require('../services/notificationService');

// @desc    Create fee structure for a class/term
// @route   POST /api/v1/fees
// @access  Admin
const createFeeStructure = async (req, res) => {
  try {
    const fee = await Fees.create({ ...req.body, createdBy: req.user._id });
    return sendSuccess(res, 201, 'Fee structure created', { fee });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Get all fee structures
// @route   GET /api/v1/fees
// @access  Admin, Teacher
const getFeeStructures = async (req, res) => {
  try {
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
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Initialize payment via Paystack
// @route   POST /api/v1/payments/initialize/paystack
// @access  Student, Parent, Admin
const initPaystack = async (req, res) => {
  try {
    const { studentId, feeStructureId, amount } = req.body;

    const student = await User.findById(studentId).select(
      'firstName lastName email',
    );
    if (!student) return sendError(res, 404, 'Student not found');

    const feeStructure = await Fees.findById(feeStructureId).populate(
      'class',
      'name',
    );
    if (!feeStructure) return sendError(res, 404, 'Fee structure not found');

    const { authorizationUrl, reference } = await initializePaystack({
      email: student.email,
      amount,
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
      amountDue: feeStructure.totalAmount,
      gateway: 'Paystack',
      transactionRef: reference,
      status: 'Pending',
      processedBy: req.user._id,
    });

    return sendSuccess(res, 200, 'Payment initialized', {
      authorizationUrl,
      reference,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Verify Paystack payment
// @route   POST /api/v1/payments/verify/paystack
// @access  Student, Parent, Admin
const verifyPaystackPayment = async (req, res) => {
  try {
    const { reference } = req.body;
    const verification = await verifyPaystack(reference);

    if (!verification.success) {
      return sendError(res, 400, 'Payment verification failed');
    }

    const payment = await Payment.findOneAndUpdate(
      { transactionRef: reference },
      {
        amountPaid: verification.amount,
        status: 'Paid',
        balance: 0,
        paymentDate: new Date(verification.paidAt),
        receiptNumber: generateReceiptNumber(),
        gatewayResponse: verification.raw,
      },
      { new: true },
    )
      .populate('student', 'firstName lastName email')
      .populate('feeStructure', 'title term academicYear');

    if (!payment) return sendError(res, 404, 'Payment record not found');

    // Send receipt email
    try {
      await sendEmail({
        to: payment.student.email,
        subject: `Payment Receipt — ${payment.receiptNumber}`,
        html: emailTemplates.paymentReceipt({
          studentName: `${payment.student.firstName} ${payment.student.lastName}`,
          receiptNumber: payment.receiptNumber,
          amount: payment.amountPaid,
          term: payment.term,
          academicYear: payment.academicYear,
          date: payment.paymentDate,
        }),
      });
    } catch (error) {
      console.log('Email error:', error);
    }

    return sendSuccess(res, 200, 'Payment verified and confirmed', { payment });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Initialize Flutterwave payment
// @route   POST /api/v1/payments/initialize/flutterwave
// @access  Student, Parent, Admin
const initFlutterwave = async (req, res) => {
  try {
    const { studentId, feeStructureId, amount } = req.body;

    const student = await User.findById(studentId).select(
      'firstName lastName email phone',
    );
    if (!student) return sendError(res, 404, 'Student not found');

    const feeStructure = await Fees.findById(feeStructureId);
    if (!feeStructure) return sendError(res, 404, 'Fee structure not found');

    const { authorizationUrl, reference } = await initializeFlutterwave({
      email: student.email,
      amount,
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
      amountDue: feeStructure.totalAmount,
      gateway: 'Flutterwave',
      transactionRef: reference,
      status: 'Pending',
    });

    return sendSuccess(res, 200, 'Payment initialized', {
      authorizationUrl,
      reference,
    });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Record manual/cash payment
// @route   POST /api/v1/payments/manual
// @access  Admin
const recordManualPayment = async (req, res) => {
  try {
    const { studentId, feeStructureId, amountPaid, gateway, notes } = req.body;

    const feeStructure = await Fees.findById(feeStructureId);
    if (!feeStructure) return sendError(res, 404, 'Fee structure not found');

    const existing = await Payment.findOne({
      student: studentId,
      feeStructure: feeStructureId,
    });

    let payment;
    if (existing) {
      existing.amountPaid += amountPaid;
      existing.notes = notes;
      existing.processedBy = req.user._id;
      existing.receiptNumber =
        existing.receiptNumber || generateReceiptNumber();
      payment = await existing.save();
    } else {
      payment = await Payment.create({
        student: studentId,
        feeStructure: feeStructureId,
        term: feeStructure.term,
        academicYear: feeStructure.academicYear,
        amountPaid,
        amountDue: feeStructure.totalAmount,
        gateway: gateway || 'Cash',
        receiptNumber: generateReceiptNumber(),
        processedBy: req.user._id,
        notes,
      });
    }

    await payment.populate([
      { path: 'student', select: 'firstName lastName email' },
      { path: 'feeStructure', select: 'title term' },
    ]);

    return sendSuccess(res, 201, 'Payment recorded', { payment });
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Get payment history for a student
// @route   GET /api/v1/payments/student/:studentId
// @access  Admin, Student (own), Parent (child)
const getStudentPayments = async (req, res) => {
  try {
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
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

// @desc    Financial overview/report
// @route   GET /api/v1/payments/report
// @access  Admin
const getFinancialReport = async (req, res) => {
  try {
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
  } catch (error) {
    return sendError(res, 500, error.message);
  }
};

module.exports = {
  createFeeStructure,
  getFeeStructures,
  initPaystack,
  verifyPaystackPayment,
  initFlutterwave,
  recordManualPayment,
  getStudentPayments,
  getFinancialReport,
};
