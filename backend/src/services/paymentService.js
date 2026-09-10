const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const AppError = require('../utils/AppError');
const { Payment } = require('../models/Fees');
const { buildFeeLedger } = require('./feeLedgerService');
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

// A fee may be settled in instalments across both channels — part on a card
// now, the rest in cash at the school office. Which side of this line a
// payment arrived on is what the balances below are broken down by.
const OFFLINE_GATEWAYS = [PAYMENT_GATEWAY.CASH, PAYMENT_GATEWAY.BANK_TRANSFER];

/**
 * Money received against each of the given fee structures, split by the
 * channel it arrived through.
 *
 * Covers both data shapes in use: one document per gateway transaction, and
 * the single accumulating document written by manual/cash entries. Returns a
 * Map keyed by fee structure id with an entry for every id asked about, so
 * callers never have to guard against a missing key.
 */
const getPaidBreakdown = async (studentId, feeStructureIds) => {
  const ids = (
    Array.isArray(feeStructureIds) ? feeStructureIds : [feeStructureIds]
  )
    .filter(Boolean)
    .map((id) => new mongoose.Types.ObjectId(String(id)));

  const byFee = new Map(
    ids.map((id) => [String(id), { online: 0, offline: 0, total: 0 }]),
  );
  if (ids.length === 0) return byFee;

  const rows = await Payment.aggregate([
    {
      $match: {
        student: new mongoose.Types.ObjectId(String(studentId)),
        feeStructure: { $in: ids },
      },
    },
    {
      $group: {
        _id: { feeStructure: '$feeStructure', gateway: '$gateway' },
        paid: { $sum: '$amountPaid' },
      },
    },
  ]);

  rows.forEach((row) => {
    const entry = byFee.get(String(row._id.feeStructure));
    if (!entry) return;
    const paid = Number(row.paid) || 0;
    if (OFFLINE_GATEWAYS.includes(row._id.gateway)) entry.offline += paid;
    else entry.online += paid;
    entry.total += paid;
  });

  return byFee;
};

/**
 * Sum of everything actually paid against a fee structure by a student.
 */
const getAmountPaidSoFar = async (studentId, feeStructureId) => {
  const breakdown = await getPaidBreakdown(studentId, feeStructureId);
  return breakdown.get(String(feeStructureId))?.total || 0;
};

/**
 * The split-payment view of one fee: what it costs, how much arrived through
 * a gateway, how much was handed over at the office, and what is still owed.
 *
 * This — not any individual payment document — is the answer to "has this
 * student paid?". A part-payment document is itself fully settled the moment
 * the gateway confirms it, so its own Paid status says nothing about whether
 * the fee behind it is clear.
 */
const describeFeeBalance = (feeStructure, paid) => {
  const totalAmount = Math.round(Number(feeStructure.totalAmount) || 0);
  const paidOnline = Math.round(paid?.online || 0);
  const paidOffline = Math.round(paid?.offline || 0);
  const paidTotal = paidOnline + paidOffline;
  const outstanding = Math.max(0, totalAmount - paidTotal);

  let status;
  if (totalAmount > 0 && outstanding === 0) status = PAYMENT_STATUS.PAID;
  else if (paidTotal > 0) status = PAYMENT_STATUS.PARTIAL;
  else if (feeStructure.dueDate && new Date(feeStructure.dueDate) < new Date())
    status = PAYMENT_STATUS.OVERDUE;
  else status = PAYMENT_STATUS.PENDING;

  return {
    totalAmount,
    paidOnline,
    paidOffline,
    paidTotal,
    outstanding,
    status,
    percentPaid:
      totalAmount > 0
        ? Math.min(100, Math.round((paidTotal / totalAmount) * 100))
        : 0,
    // Smallest amount the payer may send to a gateway right now. Below the
    // gateway minimum the only online payment still allowed is the exact
    // remainder; once the fee is clear there is nothing to send at all.
    minimumOnlinePayment:
      outstanding > 0 ? Math.min(MIN_PAYMENT_NGN, outstanding) : 0,
  };
};

/**
 * Balances for a batch of fee structures in a single aggregation.
 */
const getFeeBalances = async (studentId, feeStructures) => {
  const list = (
    Array.isArray(feeStructures) ? feeStructures : [feeStructures]
  ).filter(Boolean);

  const breakdown = await getPaidBreakdown(
    studentId,
    list.map((fee) => fee._id),
  );

  return list.map((fee) => ({
    feeStructure: fee,
    ...describeFeeBalance(fee, breakdown.get(String(fee._id))),
  }));
};

/**
 * Server-side authority on what a student still owes and what they are allowed
 * to pay right now. The client never gets to define the debt — it may only
 * request a part-payment of an amount the server already computed.
 *
 * `enforceMinimum` is the gateway floor. Cash taken over the counter is not
 * subject to it: a parent settling the last ₦40 of a fee at the office is a
 * normal thing to do, and refusing it would leave the fee permanently open.
 */
const resolvePayableAmount = async ({
  studentId,
  feeStructure,
  requestedAmount,
  enforceMinimum = true,
}) => {
  const paid = (await getPaidBreakdown(studentId, feeStructure._id)).get(
    String(feeStructure._id),
  );
  const balance = describeFeeBalance(feeStructure, paid);
  const { paidTotal: paidSoFar, outstanding } = balance;

  if (outstanding <= 0) {
    throw AppError.badRequest('This fee has already been fully paid.');
  }

  // No requested amount means "settle it in full".
  const requested =
    requestedAmount === undefined || requestedAmount === null
      ? outstanding
      : Math.round(Number(requestedAmount));

  if (!Number.isFinite(requested) || requested <= 0) {
    throw AppError.badRequest('Payment amount must be a positive number.');
  }

  // Paying off the exact remainder is always allowed, however small it is.
  // Only a part-payment that deliberately leaves a balance behind has to
  // clear the gateway floor.
  if (
    enforceMinimum &&
    requested < MIN_PAYMENT_NGN &&
    requested !== outstanding
  ) {
    throw AppError.badRequest(
      `The minimum part-payment is ₦${MIN_PAYMENT_NGN.toLocaleString()}. ` +
        `Pay the full outstanding ₦${outstanding.toLocaleString()} to clear this fee.`,
    );
  }

  if (requested > outstanding) {
    throw AppError.badRequest(
      `Amount exceeds the outstanding balance of ₦${outstanding.toLocaleString()}.`,
    );
  }

  return { amount: requested, outstanding, paidSoFar, balance };
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
    .populate('feeStructure', 'title term academicYear totalAmount dueDate');

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

  // This document's own balance is zero the moment the gateway confirms it —
  // it only ever owed the instalment it was raised for. What the receipt has
  // to report is what the *fee* still owes once this money is counted.
  // populated('student') survives a populate that matched nothing, which the
  // raw field does not.
  const studentId = payment.populated('student') || payment.student;
  const [feeBalance] =
    studentId && payment.feeStructure
      ? await getFeeBalances(studentId, [payment.feeStructure])
      : [];

  await sendReceiptEmail(payment, {
    amount: payment.amountPaid,
    outstanding: feeBalance?.outstanding,
  });

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
 *
 * `amount` and `outstanding` are passed explicitly by callers recording an
 * instalment. Over-the-counter payments accumulate onto a single record, so
 * its amountPaid is the running total: a parent who paid ₦10,000 and then
 * ₦5,000 would otherwise be e-mailed a receipt for ₦15,000 the second time.
 */
const sendReceiptEmail = async (payment, { amount, outstanding } = {}) => {
  try {
    const student = payment.student;
    if (!student?.email) return;

    const paidNow = amount ?? payment.amountPaid;
    const stillOwed = outstanding ?? payment.balance ?? 0;

    await enqueueEmail({
      to: student.email,
      subject:
        stillOwed > 0
          ? `Part-Payment Receipt — ${payment.receiptNumber}`
          : `Payment Receipt — ${payment.receiptNumber}`,
      html: emailTemplates.paymentReceipt({
        studentName: `${student.firstName} ${student.lastName}`,
        receiptNumber: payment.receiptNumber,
        amount: paidNow,
        term: payment.term,
        academicYear: payment.academicYear,
        date: payment.paymentDate,
        method: payment.gateway,
        feeTitle: payment.feeStructure?.title,
        outstanding: stillOwed,
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
  const ledger = await buildFeeLedger({ term, academicYear, classId });

  // Counts are per student per fee, not per Payment document: a family paying
  // one fee in three instalments is one student who has paid, not three.
  let paidCount = 0;
  let partialCount = 0;
  let pendingCount = 0;

  ledger.structures.forEach((row) => {
    row.students.forEach((s) => {
      if (s.shortfall === 0 && row.amount > 0) paidCount += 1;
      else if (s.paid > 0) partialCount += 1;
      else pendingCount += 1;
    });
  });

  return {
    totalExpected: ledger.billed,
    totalCollected: ledger.collected,
    totalOutstanding: ledger.outstanding,
    paidCount,
    pendingCount,
    partialCount,
    studentsOwing: ledger.studentsOwing,
    collectionRate:
      ledger.billed > 0
        ? parseFloat(((ledger.collected / ledger.billed) * 100).toFixed(1))
        : 0,
  };
};

module.exports = {
  initializePaystack,
  verifyPaystack,
  initializeFlutterwave,
  verifyFlutterwave,
  generateReceiptNumber,
  getFinancialSummary,
  getAmountPaidSoFar,
  getPaidBreakdown,
  describeFeeBalance,
  getFeeBalances,
  resolvePayableAmount,
  settlePayment,
  sendReceiptEmail,
  MIN_PAYMENT_NGN,
};
