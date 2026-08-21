/**
 * Payment reconciliation.
 *
 * Payments settled before the settlement fix were written with a hardcoded
 * `status: 'Paid'` and `balance: 0`, regardless of how much was actually
 * collected. Those records are still wrong, and no amount of new correctness
 * repairs history — until they are, the financial report is telling the bursar
 * something untrue.
 *
 * This script does two separate things:
 *
 *   1. RECORD DRIFT — finds payments whose stored status/balance disagree with
 *      what the schema would derive from amountPaid vs amountDue, and can
 *      correct them.
 *
 *   2. LEDGER — sums what was actually paid per student per fee structure and
 *      compares it to the fee total, so you can see who genuinely still owes
 *      money regardless of what any individual record claims.
 *
 * Read-only by default. Nothing is written without --apply, and nothing is
 * ever deleted.
 *
 *   node src/utils/reconcilePayments.js            # report only
 *   node src/utils/reconcilePayments.js --apply    # correct drifted records
 *   node src/utils/reconcilePayments.js --json     # machine-readable
 */

const { PAYMENT_STATUS } = require('../config/constants');

/**
 * Mirrors PaymentSchema.pre('save'). Kept as a pure function so the
 * reconciliation can be reasoned about — and tested — without a database.
 */
const deriveExpected = ({ amountPaid = 0, amountDue = 0 }) => {
  const paid = Number(amountPaid) || 0;
  const due = Number(amountDue) || 0;

  if (paid >= due) {
    return { status: PAYMENT_STATUS.PAID, balance: 0 };
  }

  if (paid > 0) {
    return { status: PAYMENT_STATUS.PARTIAL, balance: due - paid };
  }

  return { status: PAYMENT_STATUS.PENDING, balance: due - paid };
};

/**
 * Payments whose stored state disagrees with what the schema would derive.
 *
 * A record marked Paid while amountPaid < amountDue is the signature of the
 * original bug, and is called out separately because it is the one that cost
 * the school money.
 */
const findRecordDrift = (payments = []) =>
  payments.reduce((drifted, payment) => {
    const expected = deriveExpected(payment);

    const statusWrong = payment.status !== expected.status;
    const balanceWrong = Number(payment.balance ?? 0) !== expected.balance;

    if (!statusWrong && !balanceWrong) return drifted;

    drifted.push({
      id: String(payment._id),
      student: String(payment.student),
      receiptNumber: payment.receiptNumber || null,
      transactionRef: payment.transactionRef || null,
      amountPaid: Number(payment.amountPaid) || 0,
      amountDue: Number(payment.amountDue) || 0,
      stored: { status: payment.status, balance: payment.balance ?? 0 },
      expected,
      // The costly case: recorded as settled, but under-collected.
      overCredited:
        payment.status === PAYMENT_STATUS.PAID &&
        (Number(payment.amountPaid) || 0) < (Number(payment.amountDue) || 0),
    });

    return drifted;
  }, []);

/**
 * What each student actually owes on each fee structure, from the sum of
 * money genuinely received — independent of any record's status field.
 */
const buildLedger = (payments = [], feeStructures = []) => {
  const feeById = new Map(feeStructures.map((fee) => [String(fee._id), fee]));

  const groups = new Map();

  payments.forEach((payment) => {
    const key = `${payment.student}:${payment.feeStructure}`;

    const entry = groups.get(key) || {
      student: String(payment.student),
      feeStructure: String(payment.feeStructure),
      totalPaid: 0,
      recordCount: 0,
      abandonedAttempts: 0,
    };

    entry.totalPaid += Number(payment.amountPaid) || 0;
    entry.recordCount += 1;

    // A gateway attempt that was initialised and never completed. These are
    // harmless to the ledger (they contribute nothing) but they inflate
    // `totalExpected` in the financial report, which sums amountDue.
    if (
      (Number(payment.amountPaid) || 0) === 0 &&
      payment.status === PAYMENT_STATUS.PENDING &&
      payment.transactionRef
    ) {
      entry.abandonedAttempts += 1;
    }

    groups.set(key, entry);
  });

  return [...groups.values()].map((entry) => {
    const fee = feeById.get(entry.feeStructure);
    const feeTotal = Number(fee?.totalAmount) || 0;

    return {
      ...entry,
      feeTitle: fee?.title || '(fee structure missing)',
      feeTotal,
      outstanding: Math.max(0, feeTotal - entry.totalPaid),
      settled: entry.totalPaid >= feeTotal && feeTotal > 0,
      // More collected than the fee is worth — a duplicate payment, or a fee
      // that was reduced after the fact. Needs a human, not a script.
      overpaid: feeTotal > 0 && entry.totalPaid > feeTotal,
    };
  });
};

const naira = (amount) => `₦${(Number(amount) || 0).toLocaleString('en-NG')}`;

/**
 * Human-readable report.
 */
const formatReport = ({ drift, ledger, applied }) => {
  const lines = [];
  const overCredited = drift.filter((d) => d.overCredited);
  const shortfall = overCredited.reduce(
    (sum, d) => sum + (d.amountDue - d.amountPaid),
    0,
  );

  lines.push('');
  lines.push('═'.repeat(72));
  lines.push('  PAYMENT RECONCILIATION');
  lines.push('═'.repeat(72));

  // ── Record drift ──
  lines.push('');
  lines.push(
    `RECORD DRIFT — ${drift.length} record(s) disagree with the schema`,
  );
  lines.push('-'.repeat(72));

  if (drift.length === 0) {
    lines.push('  Every payment record is internally consistent.');
  } else {
    if (overCredited.length) {
      lines.push('');
      lines.push(
        `  ⚠  ${overCredited.length} marked Paid but under-collected — ` +
          `${naira(shortfall)} of fees recorded as settled that were not.`,
      );
      lines.push('');

      overCredited.slice(0, 20).forEach((d) => {
        lines.push(
          `     ${d.receiptNumber || d.transactionRef || d.id}  ` +
            `paid ${naira(d.amountPaid)} of ${naira(d.amountDue)}  ` +
            `→ ${d.expected.status}, balance ${naira(d.expected.balance)}`,
        );
      });

      if (overCredited.length > 20) {
        lines.push(`     ... and ${overCredited.length - 20} more`);
      }
    }

    const other = drift.filter((d) => !d.overCredited);
    if (other.length) {
      lines.push('');
      lines.push(
        `  ${other.length} other record(s) with a stale status or balance:`,
      );
      other.slice(0, 10).forEach((d) => {
        lines.push(
          `     ${d.id}  ${d.stored.status}/${naira(d.stored.balance)}  ` +
            `→ ${d.expected.status}/${naira(d.expected.balance)}`,
        );
      });
      if (other.length > 10)
        lines.push(`     ... and ${other.length - 10} more`);
    }
  }

  // ── Ledger ──
  const owing = ledger.filter((l) => !l.settled && l.feeTotal > 0);
  const overpaid = ledger.filter((l) => l.overpaid);
  const abandoned = ledger.reduce((sum, l) => sum + l.abandonedAttempts, 0);
  const collected = ledger.reduce((sum, l) => sum + l.totalPaid, 0);
  const outstanding = owing.reduce((sum, l) => sum + l.outstanding, 0);

  lines.push('');
  lines.push('LEDGER — what was actually collected');
  lines.push('-'.repeat(72));
  lines.push(`  Student/fee combinations : ${ledger.length}`);
  lines.push(`  Total collected          : ${naira(collected)}`);
  lines.push(
    `  Genuinely outstanding    : ${naira(outstanding)} across ${owing.length}`,
  );

  if (overpaid.length) {
    lines.push('');
    lines.push(
      `  ⚠  ${overpaid.length} combination(s) collected MORE than the fee — ` +
        'likely duplicate payments. These need a human decision, not a script.',
    );
    overpaid.slice(0, 10).forEach((l) => {
      lines.push(
        `     student ${l.student}  ${l.feeTitle}  ` +
          `paid ${naira(l.totalPaid)} of ${naira(l.feeTotal)}`,
      );
    });
  }

  if (abandoned) {
    lines.push('');
    lines.push(
      `  ${abandoned} abandoned gateway attempt(s) hold an amountDue with nothing ` +
        'paid.',
    );
    lines.push(
      '  These inflate `totalExpected` in the financial report. They are NOT ' +
        'deleted here:',
    );
    lines.push(
      '  a late webhook for an abandoned-then-completed attempt would lose the ' +
        'payment.',
    );
  }

  // ── Outcome ──
  lines.push('');
  lines.push('-'.repeat(72));

  if (applied) {
    lines.push(`  APPLIED — ${drift.length} record(s) corrected.`);
  } else if (drift.length) {
    lines.push('  DRY RUN — nothing was written.');
    lines.push('  Re-run with --apply to correct the drifted records above.');
  } else {
    lines.push('  DRY RUN — nothing to correct.');
  }

  lines.push('═'.repeat(72));
  lines.push('');

  return lines.join('\n');
};

/**
 * Correct drifted records by re-saving them, which lets the schema hook derive
 * balance and status. amountPaid is never touched — the money that came in is
 * the one fact we trust.
 */
const applyCorrections = async (Payment, drift) => {
  let corrected = 0;
  const failures = [];

  for (const item of drift) {
    try {
      const payment = await Payment.findById(item.id);
      if (!payment) {
        failures.push({ id: item.id, error: 'record disappeared' });
        continue;
      }

      // Marking the field dirty is enough for save() to run, and the
      // pre('save') hook then recomputes balance and status from it. The
      // value itself is never rewritten — the money that came in is the one
      // fact we trust.
      payment.markModified('amountPaid');
      await payment.save();

      corrected += 1;
    } catch (error) {
      failures.push({ id: item.id, error: error.message });
    }
  }

  return { corrected, failures };
};

/**
 * Load everything, analyse, optionally correct.
 */
const reconcile = async ({ Payment, Fees, apply = false }) => {
  const payments = await Payment.find({}).lean();
  const feeStructures = await Fees.find({}).select('title totalAmount').lean();

  const drift = findRecordDrift(payments);
  const ledger = buildLedger(payments, feeStructures);

  let result = { corrected: 0, failures: [] };
  if (apply && drift.length) {
    result = await applyCorrections(Payment, drift);
  }

  return { drift, ledger, applied: apply, ...result };
};

module.exports = {
  deriveExpected,
  findRecordDrift,
  buildLedger,
  formatReport,
  applyCorrections,
  reconcile,
};

// ─── CLI ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  /* eslint-disable global-require */
  require('dotenv').config();
  const mongoose = require('mongoose');
  const connectDB = require('../config/db');
  const { Fees, Payment } = require('../models/Fees');

  const apply = process.argv.includes('--apply');
  const asJson = process.argv.includes('--json');

  (async () => {
    try {
      await connectDB();

      const outcome = await reconcile({ Payment, Fees, apply });

      if (asJson) {
        console.log(JSON.stringify(outcome, null, 2));
      } else {
        console.log(formatReport(outcome));

        if (outcome.failures?.length) {
          console.error(
            `\n${outcome.failures.length} record(s) failed to correct:`,
          );
          outcome.failures.forEach((f) =>
            console.error(`  ${f.id}: ${f.error}`),
          );
        }
      }

      await mongoose.connection.close();
      process.exit(outcome.failures?.length ? 1 : 0);
    } catch (error) {
      console.error(`Reconciliation failed: ${error.message}`);
      process.exit(1);
    }
  })();
}
