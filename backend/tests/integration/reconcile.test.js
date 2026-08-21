const mongoose = require('mongoose');
const db = require('../setup/db');

const { Fees, Payment } = require('../../src/models/Fees');
const {
  deriveExpected,
  findRecordDrift,
  buildLedger,
  reconcile,
} = require('../../src/utils/reconcilePayments');

const STUDENT = new mongoose.Types.ObjectId();
const FEE_TOTAL = 45000;

let feeStructure;

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.clear();

  feeStructure = await Fees.create({
    title: 'JSS1 First Term',
    class: new mongoose.Types.ObjectId(),
    term: 'First Term',
    academicYear: '2024/2025',
    items: [{ label: 'Tuition', amount: FEE_TOTAL }],
    dueDate: new Date('2025-10-01'),
  });
});

/**
 * Write a payment straight through the driver, bypassing Mongoose hooks — this
 * is how the corrupt historic records were created (findOneAndUpdate with a
 * hardcoded status), so it is how the fixtures have to be created too.
 */
const insertRaw = (doc) =>
  Payment.collection.insertOne({
    student: STUDENT,
    feeStructure: feeStructure._id,
    term: 'First Term',
    academicYear: '2024/2025',
    gateway: 'Paystack',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...doc,
  });

describe('deriveExpected', () => {
  it('treats full payment as Paid with no balance', () => {
    expect(deriveExpected({ amountPaid: 45000, amountDue: 45000 })).toEqual({
      status: 'Paid',
      balance: 0,
    });
  });

  it('treats an overpayment as Paid, never a negative balance', () => {
    expect(deriveExpected({ amountPaid: 50000, amountDue: 45000 })).toEqual({
      status: 'Paid',
      balance: 0,
    });
  });

  it('treats a part-payment as Partial with the remainder owing', () => {
    expect(deriveExpected({ amountPaid: 100, amountDue: 45000 })).toEqual({
      status: 'Partial',
      balance: 44900,
    });
  });

  it('treats nothing paid as Pending', () => {
    expect(deriveExpected({ amountPaid: 0, amountDue: 45000 })).toEqual({
      status: 'Pending',
      balance: 45000,
    });
  });

  it('matches what the schema hook produces', async () => {
    // If the hook and the script ever diverge, reconciliation would "correct"
    // records into a state the application would immediately undo.
    const payment = await Payment.create({
      student: STUDENT,
      feeStructure: feeStructure._id,
      term: 'First Term',
      academicYear: '2024/2025',
      amountPaid: 12000,
      amountDue: FEE_TOTAL,
    });

    const expected = deriveExpected({
      amountPaid: 12000,
      amountDue: FEE_TOTAL,
    });

    expect(payment.status).toBe(expected.status);
    expect(payment.balance).toBe(expected.balance);
  });
});

describe('findRecordDrift', () => {
  it('finds nothing when records are consistent', () => {
    const drift = findRecordDrift([
      {
        _id: 'a',
        student: STUDENT,
        amountPaid: 45000,
        amountDue: 45000,
        status: 'Paid',
        balance: 0,
      },
    ]);
    expect(drift).toHaveLength(0);
  });

  it('flags the original bug: marked Paid but under-collected', () => {
    const drift = findRecordDrift([
      {
        _id: 'a',
        student: STUDENT,
        amountPaid: 100,
        amountDue: 45000,
        status: 'Paid',
        balance: 0,
      },
    ]);

    expect(drift).toHaveLength(1);
    expect(drift[0].overCredited).toBe(true);
    expect(drift[0].expected).toEqual({ status: 'Partial', balance: 44900 });
  });

  it('flags a stale balance even when the status is right', () => {
    const drift = findRecordDrift([
      {
        _id: 'a',
        student: STUDENT,
        amountPaid: 100,
        amountDue: 45000,
        status: 'Partial',
        balance: 0,
      },
    ]);

    expect(drift).toHaveLength(1);
    expect(drift[0].overCredited).toBe(false);
  });

  it('does not flag a legitimately settled record', () => {
    const drift = findRecordDrift([
      {
        _id: 'a',
        student: STUDENT,
        amountPaid: 50000,
        amountDue: 45000,
        status: 'Paid',
        balance: 0,
      },
    ]);
    expect(drift).toHaveLength(0);
  });
});

describe('buildLedger', () => {
  const fees = [{ _id: 'fee1', title: 'JSS1', totalAmount: 45000 }];

  it('sums what was actually paid across several records', () => {
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 20000,
          status: 'Partial',
        },
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 15000,
          status: 'Partial',
        },
      ],
      fees,
    );

    expect(ledger).toHaveLength(1);
    expect(ledger[0].totalPaid).toBe(35000);
    expect(ledger[0].outstanding).toBe(10000);
    expect(ledger[0].settled).toBe(false);
  });

  it('ignores a lying status field and trusts the money', () => {
    // Every record claims Paid; only ₦200 was ever collected.
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 100,
          status: 'Paid',
        },
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 100,
          status: 'Paid',
        },
      ],
      fees,
    );

    expect(ledger[0].totalPaid).toBe(200);
    expect(ledger[0].outstanding).toBe(44800);
    expect(ledger[0].settled).toBe(false);
  });

  it('marks a fully paid combination as settled', () => {
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 45000,
          status: 'Paid',
        },
      ],
      fees,
    );

    expect(ledger[0].settled).toBe(true);
    expect(ledger[0].outstanding).toBe(0);
  });

  it('flags an overpayment for human review rather than silently absorbing it', () => {
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 45000,
          status: 'Paid',
        },
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 45000,
          status: 'Paid',
        },
      ],
      fees,
    );

    expect(ledger[0].overpaid).toBe(true);
    expect(ledger[0].outstanding).toBe(0);
  });

  it('counts abandoned gateway attempts separately', () => {
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 0,
          status: 'Pending',
          transactionRef: 'SMP-1',
        },
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 0,
          status: 'Pending',
          transactionRef: 'SMP-2',
        },
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 45000,
          status: 'Paid',
          transactionRef: 'SMP-3',
        },
      ],
      fees,
    );

    expect(ledger[0].abandonedAttempts).toBe(2);
    expect(ledger[0].totalPaid).toBe(45000);
    expect(ledger[0].settled).toBe(true);
  });

  it('separates different students on the same fee', () => {
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'fee1',
          amountPaid: 45000,
          status: 'Paid',
        },
        {
          student: 's2',
          feeStructure: 'fee1',
          amountPaid: 100,
          status: 'Paid',
        },
      ],
      fees,
    );

    expect(ledger).toHaveLength(2);
    expect(ledger.find((l) => l.student === 's2').outstanding).toBe(44900);
  });

  it('survives a payment whose fee structure was deleted', () => {
    const ledger = buildLedger(
      [
        {
          student: 's1',
          feeStructure: 'gone',
          amountPaid: 5000,
          status: 'Paid',
        },
      ],
      fees,
    );

    expect(ledger[0].feeTitle).toMatch(/missing/i);
    expect(ledger[0].feeTotal).toBe(0);
  });
});

describe('reconcile (end to end)', () => {
  it('reports drift without writing anything in dry-run', async () => {
    await insertRaw({
      amountPaid: 100,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      receiptNumber: 'RCP-OLD-001',
    });

    const outcome = await reconcile({ Payment, Fees, apply: false });

    expect(outcome.drift).toHaveLength(1);
    expect(outcome.applied).toBe(false);
    expect(outcome.corrected).toBe(0);

    // Still wrong on disk — dry run must not touch anything.
    const stored = await Payment.findOne({ receiptNumber: 'RCP-OLD-001' });
    expect(stored.status).toBe('Paid');
    expect(stored.balance).toBe(0);
  });

  it('corrects a corrupted record when applied', async () => {
    await insertRaw({
      amountPaid: 100,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      receiptNumber: 'RCP-OLD-002',
    });

    const outcome = await reconcile({ Payment, Fees, apply: true });

    expect(outcome.corrected).toBe(1);

    const stored = await Payment.findOne({ receiptNumber: 'RCP-OLD-002' });
    expect(stored.status).toBe('Partial');
    expect(stored.balance).toBe(FEE_TOTAL - 100);
    // The money that came in is the one fact we never rewrite.
    expect(stored.amountPaid).toBe(100);
  });

  it('leaves correct records untouched', async () => {
    await insertRaw({
      amountPaid: FEE_TOTAL,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      receiptNumber: 'RCP-GOOD-001',
    });

    const outcome = await reconcile({ Payment, Fees, apply: true });

    expect(outcome.drift).toHaveLength(0);
    expect(outcome.corrected).toBe(0);
  });

  it('is idempotent — a second run finds nothing left to do', async () => {
    await insertRaw({
      amountPaid: 5000,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      receiptNumber: 'RCP-OLD-003',
    });

    await reconcile({ Payment, Fees, apply: true });
    const second = await reconcile({ Payment, Fees, apply: true });

    expect(second.drift).toHaveLength(0);
    expect(second.corrected).toBe(0);
  });

  it('never deletes a record', async () => {
    await insertRaw({
      amountPaid: 0,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      transactionRef: 'SMP-ABANDONED',
    });
    await insertRaw({
      amountPaid: 100,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      transactionRef: 'SMP-SHORT',
    });

    const before = await Payment.countDocuments();
    await reconcile({ Payment, Fees, apply: true });
    const after = await Payment.countDocuments();

    expect(after).toBe(before);
  });

  it('reports the true outstanding total across a mix of records', async () => {
    await insertRaw({
      amountPaid: 100,
      amountDue: FEE_TOTAL,
      status: 'Paid',
      balance: 0,
      transactionRef: 'SMP-A',
    });
    await insertRaw({
      amountPaid: 0,
      amountDue: FEE_TOTAL,
      status: 'Pending',
      balance: FEE_TOTAL,
      transactionRef: 'SMP-B',
    });

    const { ledger } = await reconcile({ Payment, Fees, apply: false });

    const entry = ledger.find((l) => l.student === String(STUDENT));
    expect(entry.totalPaid).toBe(100);
    expect(entry.outstanding).toBe(FEE_TOTAL - 100);
    expect(entry.abandonedAttempts).toBe(1);
  });
});
