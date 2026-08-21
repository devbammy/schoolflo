const mongoose = require('mongoose');
const db = require('../setup/db');

// The gateway is the one thing we must not hit for real. Everything else —
// Mongo, the schema hooks, the indexes — is exercised genuinely.
jest.mock('../../src/services/notificationService', () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
  sendBulkEmails: jest.fn().mockResolvedValue({ sent: 0, failed: 0, total: 0 }),
  verifyTransport: jest.fn().mockResolvedValue(true),
  emailTemplates: new Proxy({}, { get: () => () => '<html></html>' }),
}));

jest.mock('../../src/services/jobQueue', () => ({
  enqueueEmail: jest.fn().mockResolvedValue({ success: true, queued: true }),
  enqueueBulkEmail: jest.fn().mockResolvedValue({ queued: 0, total: 0 }),
  startJobQueue: jest.fn(),
  stopJobQueue: jest.fn(),
}));

const { Fees, Payment } = require('../../src/models/Fees');
const paymentService = require('../../src/services/paymentService');

const STUDENT_ID = new mongoose.Types.ObjectId();
const FEE_TOTAL = 45000;

let feeStructure;

/**
 * Stub the Paystack verify endpoint at the network boundary.
 *
 * Spying on paymentService.verifyPaystack would not work — settlePayment
 * calls it as a module-local reference, not through the exports object. Going
 * through fetch also means the real verifyPaystack runs, so the kobo-to-naira
 * conversion and status mapping are covered too.
 */
const mockVerify = ({ success = true, amount, currency = 'NGN', raw = {} }) => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({
      status: true,
      data: {
        status: success ? 'success' : 'failed',
        amount: amount * 100, // Paystack reports kobo
        currency,
        reference: 'SMP-TEST0001',
        channel: 'card',
        paid_at: new Date().toISOString(),
        ...raw,
      },
    }),
  });
};

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();
  jest.restoreAllMocks();

  feeStructure = await Fees.create({
    title: 'JSS1 First Term',
    class: new mongoose.Types.ObjectId(),
    term: 'First Term',
    academicYear: '2024/2025',
    items: [{ label: 'Tuition', amount: FEE_TOTAL, isCompulsory: true }],
    dueDate: new Date('2025-10-01'),
  });
});

describe('Payment schema', () => {
  it('derives balance and Partial status from the amount actually paid', async () => {
    const payment = await Payment.create({
      student: STUDENT_ID,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: 100,
      amountDue: FEE_TOTAL,
    });

    expect(payment.status).toBe('Partial');
    expect(payment.balance).toBe(FEE_TOTAL - 100);
  });

  it('marks a full payment as Paid with a zero balance', async () => {
    const payment = await Payment.create({
      student: STUDENT_ID,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: FEE_TOTAL,
      amountDue: FEE_TOTAL,
    });

    expect(payment.status).toBe('Paid');
    expect(payment.balance).toBe(0);
  });
});

describe('resolvePayableAmount', () => {
  it('charges the full fee when nothing has been paid', async () => {
    const { amount, outstanding } = await paymentService.resolvePayableAmount({
      studentId: STUDENT_ID,
      feeStructure,
    });

    expect(amount).toBe(FEE_TOTAL);
    expect(outstanding).toBe(FEE_TOTAL);
  });

  it('subtracts what has already been paid', async () => {
    await Payment.create({
      student: STUDENT_ID,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: 15000,
      amountDue: FEE_TOTAL,
      gateway: 'Cash',
    });

    const { outstanding } = await paymentService.resolvePayableAmount({
      studentId: STUDENT_ID,
      feeStructure,
    });

    expect(outstanding).toBe(FEE_TOTAL - 15000);
  });

  it('allows a smaller part-payment', async () => {
    const { amount } = await paymentService.resolvePayableAmount({
      studentId: STUDENT_ID,
      feeStructure,
      requestedAmount: 5000,
    });

    expect(amount).toBe(5000);
  });

  it('refuses an amount above the outstanding balance', async () => {
    // This is the hole that let a client define its own price.
    await expect(
      paymentService.resolvePayableAmount({
        studentId: STUDENT_ID,
        feeStructure,
        requestedAmount: FEE_TOTAL + 100000,
      }),
    ).rejects.toThrow(/exceeds the outstanding balance/i);
  });

  it('refuses a negative or zero amount', async () => {
    await expect(
      paymentService.resolvePayableAmount({
        studentId: STUDENT_ID,
        feeStructure,
        requestedAmount: -5000,
      }),
    ).rejects.toThrow(/positive number/i);
  });

  it('refuses an amount below the gateway minimum', async () => {
    await expect(
      paymentService.resolvePayableAmount({
        studentId: STUDENT_ID,
        feeStructure,
        requestedAmount: 5,
      }),
    ).rejects.toThrow(/minimum part-payment/i);
  });

  it('refuses payment on a fee that is already settled', async () => {
    await Payment.create({
      student: STUDENT_ID,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: FEE_TOTAL,
      amountDue: FEE_TOTAL,
      gateway: 'Cash',
    });

    await expect(
      paymentService.resolvePayableAmount({
        studentId: STUDENT_ID,
        feeStructure,
      }),
    ).rejects.toThrow(/already been fully paid/i);
  });
});

describe('settlePayment', () => {
  const REF = 'SMP-TEST0001';

  const pendingPayment = (amountDue = FEE_TOTAL) =>
    Payment.create({
      student: STUDENT_ID,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: 0,
      amountDue,
      gateway: 'Paystack',
      transactionRef: REF,
      status: 'Pending',
    });

  it('records a full payment as Paid', async () => {
    await pendingPayment();
    mockVerify({ amount: FEE_TOTAL });

    const { settled } = await paymentService.settlePayment({ reference: REF });
    expect(settled).toBe(true);

    const stored = await Payment.findOne({ transactionRef: REF });
    expect(stored.status).toBe('Paid');
    expect(stored.balance).toBe(0);
    expect(stored.amountPaid).toBe(FEE_TOTAL);
  });

  it('records an underpayment as Partial, not Paid', async () => {
    // The original bug: status and balance were hardcoded, so paying ₦100
    // against a ₦45,000 fee cleared the whole debt.
    await pendingPayment();
    mockVerify({ amount: 100 });

    await paymentService.settlePayment({ reference: REF });

    const stored = await Payment.findOne({ transactionRef: REF });
    expect(stored.status).toBe('Partial');
    expect(stored.amountPaid).toBe(100);
    expect(stored.balance).toBe(FEE_TOTAL - 100);
  });

  it('issues a receipt number on settlement', async () => {
    await pendingPayment();
    mockVerify({ amount: FEE_TOTAL });

    const { payment } = await paymentService.settlePayment({ reference: REF });
    expect(payment.receiptNumber).toMatch(/^RCP-\d{2}-\d{6}$/);
  });

  it('is idempotent — a second settlement does not double-count', async () => {
    // The redirect and the webhook routinely both fire for one transaction.
    await pendingPayment();
    mockVerify({ amount: FEE_TOTAL });

    const first = await paymentService.settlePayment({ reference: REF });
    const second = await paymentService.settlePayment({ reference: REF });

    expect(first.alreadySettled).toBe(false);
    expect(second.alreadySettled).toBe(true);

    const stored = await Payment.findOne({ transactionRef: REF });
    expect(stored.amountPaid).toBe(FEE_TOTAL);
    expect(second.payment.receiptNumber).toBe(first.payment.receiptNumber);
  });

  it('refuses a transaction the gateway did not confirm', async () => {
    await pendingPayment();
    mockVerify({ success: false, amount: FEE_TOTAL });

    const { settled, reason } = await paymentService.settlePayment({
      reference: REF,
    });

    expect(settled).toBe(false);
    expect(reason).toBe('not_successful');

    const stored = await Payment.findOne({ transactionRef: REF });
    expect(stored.status).toBe('Pending');
  });

  it('refuses a transaction in the wrong currency', async () => {
    await pendingPayment();
    mockVerify({ amount: FEE_TOTAL, currency: 'USD' });

    const { settled, reason } = await paymentService.settlePayment({
      reference: REF,
    });

    expect(settled).toBe(false);
    expect(reason).toBe('currency_mismatch');
  });

  it('refuses a zero or nonsense amount', async () => {
    await pendingPayment();
    mockVerify({ amount: 0 });

    const { settled, reason } = await paymentService.settlePayment({
      reference: REF,
    });

    expect(settled).toBe(false);
    expect(reason).toBe('invalid_amount');
  });

  it('reports an unknown reference rather than throwing', async () => {
    const { settled, reason } = await paymentService.settlePayment({
      reference: 'SMP-DOES-NOT-EXIST',
    });

    expect(settled).toBe(false);
    expect(reason).toBe('not_found');
  });

  it('never returns the raw gateway payload to the caller', async () => {
    await pendingPayment();
    mockVerify({
      amount: FEE_TOTAL,
      raw: { authorization: { last4: '4081' }, customer: { email: 'x@y.z' } },
    });

    const { payment } = await paymentService.settlePayment({ reference: REF });

    expect(payment.gatewayResponse).toBeUndefined();

    // ...but it is still persisted for reconciliation.
    const stored = await Payment.findOne({ transactionRef: REF }).select(
      '+gatewayResponse',
    );
    expect(stored.gatewayResponse).toBeDefined();
  });
});

describe('generateReceiptNumber', () => {
  it('is sequential and unique under concurrency', async () => {
    // The old timestamp-plus-random scheme collided against a unique index,
    // throwing after the money had already been taken.
    const numbers = await Promise.all(
      Array.from({ length: 50 }, () => paymentService.generateReceiptNumber()),
    );

    expect(new Set(numbers).size).toBe(50);
    numbers.forEach((n) => expect(n).toMatch(/^RCP-\d{2}-\d{6}$/));
  });
});
