const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { Payment } = require('../models/Fees');
const Sequence = require('../models/Sequence');
const { PAYMENT_STATUS, PAYMENT_GATEWAY } = require('../config/constants');
const { emailTemplates } = require('./notificationService');
const { enqueueEmail } = require('./jobQueue');

// Smallest amount we will hand to a gateway. Anything below this is a nuisance
// transaction that costs more in gateway fees than it collects.
const MIN_PAYMENT_NGN = 100;

/**
 * Initialize a Paystack payment
 */
const initializePaystack = async ({ email, amount, metadata, callbackUrl }) => {
  const response = await fetch(
    'https://api.paystack.co/transaction/initialize',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        amount: Math.round(amount * 100), // Convert to kobo
        reference: `SMP-${uuidv4().split('-')[0].toUpperCase()}`,
        callback_url:
          callbackUrl || `${process.env.CLIENT_URL}/payments/verify`,
        metadata,
      }),
    },
  );

  const data = await response.json();
  if (!data.status)
    throw new Error(data.message || 'Paystack initialization failed');
  return {
    authorizationUrl: data.data.authorization_url,
    reference: data.data.reference,
  };
};

/**
 * Verify a Paystack transaction
 */
const verifyPaystack = async (reference) => {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${reference}`,
    {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    },
  );

  const data = await response.json();
  if (!data.status) throw new Error('Paystack verification failed');

  const tx = data.data;
  return {
    success: tx.status === 'success',
    amount: tx.amount / 100,
    reference: tx.reference,
    channel: tx.channel,
    paidAt: tx.paid_at,
    currency: tx.currency,
    raw: tx,
  };
};

/**
 * Initialize a Flutterwave payment
 */
const initializeFlutterwave = async ({
  email,
  amount,
  name,
  phone,
  metadata,
  redirectUrl,
}) => {
  const txRef = `SMP-FLW-${uuidv4().split('-')[0].toUpperCase()}`;

  const response = await fetch('https://api.flutterwave.com/v3/payments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_ref: txRef,
      amount,
      currency: 'NGN',
      redirect_url: redirectUrl || `${process.env.CLIENT_URL}/payments/verify`,
      customer: { email, name, phone_number: phone },
      meta: metadata,
      customizations: {
        title: 'School Management Portal',
        description: 'Fee Payment',
        logo: `${process.env.CLIENT_URL}/logo.png`,
      },
    }),
  });

  const data = await response.json();
  if (data.status !== 'success')
    throw new Error(data.message || 'Flutterwave initialization failed');
  return { authorizationUrl: data.data.link, reference: txRef };
};

/**
 * Verify a Flutterwave transaction by the tx_ref we generated at initialization.
 * Keyed on our own reference rather than Flutterwave's transaction id so that
 * settlement works identically for both gateways.
 */
const verifyFlutterwave = async (reference) => {
  const response = await fetch(
    `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(reference)}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}`,
      },
    },
  );

  const data = await response.json();
  if (data.status !== 'success')
    throw new Error('Flutterwave verification failed');

  const tx = data.data;
  return {
    success: tx.status === 'successful',
    amount: tx.amount,
    reference: tx.tx_ref,
    channel: tx.payment_type,
    paidAt: tx.created_at,
    currency: tx.currency,
    raw: tx,
  };
};

/**
 * Generate a sequential receipt number: RCP-25-000042.
 *
 * Backed by an atomic counter rather than a timestamp plus three random
 * digits, which collided roughly once in a thousand receipts issued in the
 * same millisecond window — and collided against a unique index, throwing
 * after the money had already been taken.
 */
const generateReceiptNumber = async () => {
  const year = new Date().getFullYear().toString().slice(-2);
  const seq = await Sequence.next(`receipt-${year}`);
  return `RCP-${year}-${String(seq).padStart(6, '0')}`;
};

/**
 * Sum of everything actually paid against a fee structure by a student.
 * Covers both data shapes in use: one document per gateway transaction, and
 * the single accumulating document written by manual/cash entries.
 */
const getAmountPaidSoFar = async (studentId, feeStructureId) => {
  const [agg] = await Payment.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(String(studentId)),
        feeStructure: new mongoose.Types.ObjectId(String(feeStructureId)),
      },
    },
    { $group: { _id: null, paid: { $sum: '$amountPaid' } } },
  ]);

  return agg?.paid || 0;
};

/**
 * Server-side authority on what a student still owes and what they are allowed
 * to send to a gateway. The client never gets to define the debt — it may only
 * request a part-payment of an amount the server already computed.
 */
const resolvePayableAmount = async ({
  studentId,
  feeStructure,
  requestedAmount,
}) => {
  const paidSoFar = await getAmountPaidSoFar(studentId, feeStructure._id);
  const outstanding = Math.max(
    0,
    Math.round((feeStructure.totalAmount || 0) - paidSoFar),
  );

  if (outstanding <= 0) {
    const err = new Error('This fee has already been fully paid.');
    err.statusCode = 400;
    throw err;
  }

  // No requested amount means "settle it in full".
  const requested =
    requestedAmount === undefined || requestedAmount === null
      ? outstanding
      : Math.round(Number(requestedAmount));

  if (!Number.isFinite(requested) || requested <= 0) {
    const err = new Error('Payment amount must be a positive number.');
    err.statusCode = 400;
    throw err;
  }

  if (requested < MIN_PAYMENT_NGN) {
    const err = new Error(
      `The minimum payment amount is ₦${MIN_PAYMENT_NGN.toLocaleString()}.`,
    );
    err.statusCode = 400;
    throw err;
  }

  if (requested > outstanding) {
    const err = new Error(
      `Amount exceeds the outstanding balance of ₦${outstanding.toLocaleString()}.`,
    );
    err.statusCode = 400;
    throw err;
  }

  return { amount: requested, outstanding, paidSoFar };
};

/**
 * Confirm a gateway transaction and write it to the ledger.
 *
 * This is the single settlement path — both the browser redirect (fast, best
 * effort) and the gateway webhook (authoritative, retried) call it, so a
 * payment lands exactly once no matter which arrives first, or whether the
 * payer ever came back to the site at all.
 */
const settlePayment = async ({ reference }) => {
  const payment = await Payment.findOne({ transactionRef: reference })
    .populate('student', 'firstName lastName email')
    .populate('feeStructure', 'title term academicYear');

  if (!payment) return { settled: false, reason: 'not_found' };

  // Idempotency: the redirect and the webhook routinely both fire.
  if (payment.status === PAYMENT_STATUS.PAID) {
    return {
      settled: true,
      alreadySettled: true,
      payment: publicPayment(payment),
    };
  }

  const verification =
    payment.gateway === PAYMENT_GATEWAY.FLUTTERWAVE
      ? await verifyFlutterwave(reference)
      : await verifyPaystack(reference);

  if (!verification.success) {
    return { settled: false, reason: 'not_successful', payment };
  }

  if (verification.currency && verification.currency !== 'NGN') {
    return { settled: false, reason: 'currency_mismatch', payment };
  }

  const amount = Number(verification.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { settled: false, reason: 'invalid_amount', payment };
  }

  payment.amountPaid = amount;
  payment.paymentDate = verification.paidAt
    ? new Date(verification.paidAt)
    : new Date();
  payment.gatewayResponse = verification.raw;
  payment.receiptNumber =
    payment.receiptNumber || (await generateReceiptNumber());

  // save() — not findOneAndUpdate() — so the pre('save') hook derives balance
  // and status from the amount that actually landed.
  await payment.save();

  await sendReceiptEmail(payment);

  return {
    settled: true,
    alreadySettled: false,
    payment: publicPayment(payment),
  };
};

/**
 * `gatewayResponse` is `select: false` in the schema, but we assign it in
 * memory above, so it would otherwise be serialized straight back to the
 * client. It holds the gateway's full payload — card metadata, customer
 * details, fee breakdown — and belongs only in the database.
 */
const publicPayment = (payment) => {
  const plain = payment.toObject ? payment.toObject() : { ...payment };
  delete plain.gatewayResponse;
  return plain;
};

/**
 * Receipt email. Never allowed to fail a settlement — the money is already in.
 */
const sendReceiptEmail = async (payment) => {
  try {
    const student = payment.student;
    if (!student?.email) return;

    await enqueueEmail({
      to: student.email,
      subject: `Payment Receipt — ${payment.receiptNumber}`,
      html: emailTemplates.paymentReceipt({
        studentName: `${student.firstName} ${student.lastName}`,
        receiptNumber: payment.receiptNumber,
        amount: payment.amountPaid,
        term: payment.term,
        academicYear: payment.academicYear,
        date: payment.paymentDate,
      }),
    });
  } catch (error) {
    console.error(`Receipt email failed for ${payment._id}: ${error.message}`);
  }
};

/**
 * Get financial summary for a class/term
 */
const getFinancialSummary = async (classId, term, academicYear) => {
  const payments = await Payment.find({ term, academicYear })
    .populate({
      path: 'student',
      match: { 'studentProfile.class': classId },
      select: 'firstName lastName',
    })
    .populate('feeStructure', 'totalAmount title');

  const filtered = payments.filter((p) => p.student !== null);

  const summary = {
    totalExpected: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    paidCount: 0,
    pendingCount: 0,
    partialCount: 0,
  };

  filtered.forEach((p) => {
    summary.totalExpected += p.amountDue;
    summary.totalCollected += p.amountPaid;
    summary.totalOutstanding += p.balance;
    if (p.status === 'Paid') summary.paidCount++;
    else if (p.status === 'Pending') summary.pendingCount++;
    else if (p.status === 'Partial') summary.partialCount++;
  });

  summary.collectionRate =
    summary.totalExpected > 0
      ? parseFloat(
          ((summary.totalCollected / summary.totalExpected) * 100).toFixed(1),
        )
      : 0;

  return summary;
};

module.exports = {
  initializePaystack,
  verifyPaystack,
  initializeFlutterwave,
  verifyFlutterwave,
  generateReceiptNumber,
  getFinancialSummary,
  getAmountPaidSoFar,
  resolvePayableAmount,
  settlePayment,
  sendReceiptEmail,
  MIN_PAYMENT_NGN,
};
