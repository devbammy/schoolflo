const mongoose = require('mongoose');
const User = require('../models/User');
const { Fees, Payment } = require('../models/Fees');
const { isBilledFor } = require('../utils/enrolment');

/**
 * The one definition of what the school is owed.
 *
 * Split out of `paymentService` because it is a pure read: fee structures,
 * enrolment and money received, with no gateway, mailer or job queue behind
 * it. Both the admin overview card and the financial report read from here, so
 * the two screens cannot drift into disagreeing about the same figure.
 */

/**
 * What the school is owed, and by whom.
 *
 * `totalExpected` used to be summed from `Payment.amountDue`, which made it a
 * measure of payment *attempts* rather than of money owed. Every abandoned
 * gateway checkout leaves a Pending row behind, so a parent who opened the
 * payment page four times and paid once inflated expected revenue fourfold —
 * while a student nobody had raised a payment for contributed nothing at all,
 * so a school that had billed everyone and collected from nobody reported a
 * 100% collection rate against a ₦0 expectation.
 *
 * Expected revenue is a property of the fee structures and the roster they
 * apply to: every active student enrolled in a class owes that class's fee for
 * the term, whether or not a Payment document exists for them. Collected is
 * the one figure that was always honest — money that actually arrived.
 *
 * Returns one row per fee structure, each carrying the roster it was billed
 * against, so callers needing more than the headline (who is owing, which
 * structures are overdue) build it from these numbers rather than running a
 * second, subtly different query.
 */
const buildFeeLedger = async ({ term, academicYear, classId } = {}) => {
  const feeFilter = { isActive: true };
  if (term) feeFilter.term = term;
  if (academicYear) feeFilter.academicYear = academicYear;
  if (classId) feeFilter.class = new mongoose.Types.ObjectId(String(classId));

  const feeStructures = await Fees.find(feeFilter)
    .select('title class term academicYear totalAmount dueDate')
    .lean();

  if (feeStructures.length === 0) {
    return {
      structures: [],
      billed: 0,
      collected: 0,
      outstanding: 0,
      studentsOwing: 0,
      studentsBilled: 0,
      hasStructures: false,
    };
  }

  const classIds = [
    ...new Set(feeStructures.map((f) => String(f.class)).filter(Boolean)),
  ];
  const feeIds = feeStructures.map((f) => f._id);

  const classObjectIds = classIds.map((id) => new mongoose.Types.ObjectId(id));

  const [candidates, paidRows] = await Promise.all([
    // Everyone who is, or has ever been, in one of these classes. Whether each
    // owes a particular fee depends on its session, so that is decided per fee
    // below: reading the current roster alone billed a closed session's fees to
    // whoever had since moved into the class, and let the debts of those who
    // moved out, or left, disappear.
    User.find({
      role: 'Student',
      $or: [
        {
          // profileStatus is absent on students created through an update
          // rather than a create — findByIdAndUpdate does not apply schema
          // defaults — and those students are still enrolled.
          'studentProfile.profileStatus': { $in: ['Active', null] },
          'studentProfile.class': { $in: classObjectIds },
        },
        { 'studentProfile.enrolments.class': { $in: classObjectIds } },
      ],
    })
      .select(
        'studentProfile.class studentProfile.enrolments studentProfile.profileStatus',
      )
      .lean(),
    Payment.aggregate([
      { $match: { feeStructure: { $in: feeIds } } },
      {
        $group: {
          _id: { feeStructure: '$feeStructure', student: '$student' },
          paid: { $sum: '$amountPaid' },
        },
      },
    ]),
  ]);

  const paidByPair = new Map(
    paidRows.map((row) => [
      `${row._id.feeStructure}:${row._id.student}`,
      Number(row.paid) || 0,
    ]),
  );

  const owing = new Set();
  const billedStudents = new Set();
  let billed = 0;
  let collected = 0;

  const structures = feeStructures.map((fee) => {
    const roster = candidates
      .filter((student) =>
        isBilledFor(student, fee, {
          excluding: ['Graduated', 'Withdrawn', 'Suspended'],
        }),
      )
      .map((student) => student._id);
    const amount = Math.round(Number(fee.totalAmount) || 0);
    let structureCollected = 0;
    let structureOutstanding = 0;

    const students = roster.map((studentId) => {
      const paid = paidByPair.get(`${fee._id}:${studentId}`) || 0;
      const shortfall = Math.max(0, amount - paid);
      // An overpayment on one fee must not subsidise another in the headline
      // rate: collection is capped at what each student was actually billed.
      const counted = Math.min(paid, amount);

      billed += amount;
      collected += counted;
      structureCollected += counted;
      structureOutstanding += shortfall;
      billedStudents.add(String(studentId));
      if (shortfall > 0) owing.add(String(studentId));

      return { student: studentId, paid, shortfall };
    });

    return {
      fee,
      amount,
      students,
      billed: amount * students.length,
      collected: structureCollected,
      outstanding: structureOutstanding,
      studentsOwing: students.filter((s) => s.shortfall > 0).length,
    };
  });

  return {
    structures,
    billed,
    collected,
    outstanding: Math.max(0, billed - collected),
    studentsOwing: owing.size,
    studentsBilled: billedStudents.size,
    hasStructures: true,
  };
};

module.exports = { buildFeeLedger };
