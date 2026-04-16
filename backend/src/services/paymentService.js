const { v4: uuidv4 } = require('uuid');
const { Payment } = require('../models/Fees');

/**
 * Initialize a Paystack payment
 */
const initializePaystack = async ({ email, amount, metadata, callbackUrl }) => {
  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amount * 100), // Convert to kobo
      reference: `SMP-${uuidv4().split('-')[0].toUpperCase()}`,
      callback_url: callbackUrl || `${process.env.CLIENT_URL}/payments/verify`,
      metadata,
    }),
  });

  const data = await response.json();
  if (!data.status) throw new Error(data.message || 'Paystack initialization failed');
  return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
};

/**
 * Verify a Paystack transaction
 */
const verifyPaystack = async (reference) => {
  const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });

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
const initializeFlutterwave = async ({ email, amount, name, phone, metadata, redirectUrl }) => {
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
  if (data.status !== 'success') throw new Error(data.message || 'Flutterwave initialization failed');
  return { authorizationUrl: data.data.link, reference: txRef };
};

/**
 * Verify a Flutterwave transaction
 */
const verifyFlutterwave = async (transactionId) => {
  const response = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
    headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
  });

  const data = await response.json();
  if (data.status !== 'success') throw new Error('Flutterwave verification failed');

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
 * Generate a receipt number
 */
const generateReceiptNumber = () => {
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  return `RCP-${timestamp}-${random}`;
};

/**
 * Get financial summary for a class/term
 */
const getFinancialSummary = async (classId, term, academicYear) => {
  const payments = await Payment.find({ term, academicYear })
    .populate({ path: 'student', match: { 'studentProfile.class': classId }, select: 'firstName lastName' })
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

  summary.collectionRate = summary.totalExpected > 0
    ? parseFloat(((summary.totalCollected / summary.totalExpected) * 100).toFixed(1))
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
};
