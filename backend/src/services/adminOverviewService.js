const User = require('../models/User');
const Class = require('../models/Class');
const Attendance = require('../models/Attendance');
const { buildFeeLedger } = require('./feeLedgerService');
const { Assignment, Submission } = require('../models/Assignment');
const { Result } = require('../models/Exam');
const Announcement = require('../models/Announcement');
const AcademicCalendar = require('../models/AcademicCalendar');

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The admin overview exists to answer three questions, in this order:
 *
 *   1. What is happening at my school?  -> `pulse`
 *   2. What needs my attention?         -> `attention`
 *   3. What should I do next?           -> the `action` on each attention item,
 *                                          plus `upcoming`
 *
 * Everything here is shaped around those answers. A number that cannot be acted
 * on, or that only makes sense next to a number we do not have, does not belong
 * on this screen — it belongs on the page that owns it.
 */

const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

/**
 * Attendance is only meaningful against days the school actually ran. We do not
 * model per-class timetables, so weekdays are the best available proxy —
 * counting weekends would drag every rate down and make the panel lie.
 */
const recentSchoolDays = (count, before = new Date()) => {
  const days = [];
  const cursor = startOfDay(before);
  cursor.setDate(cursor.getDate() - 1); // walk back from yesterday; today is separate
  while (days.length < count) {
    if (!isWeekend(cursor)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return days;
};

const pct = (part, whole) =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;

/**
 * Which term and year are we reporting on? The academic calendar is the
 * authority; explicit query params override it (an admin reconciling last term
 * still needs to look at last term); only if neither exists do we fall back to
 * guessing from the wall clock.
 */
const resolveContext = async ({ academicYear, term }) => {
  const calendar = await AcademicCalendar.findOne({ isActive: true });
  const currentTerm = calendar?.currentTerm || null;

  const resolvedYear =
    academicYear ||
    calendar?.academicYear ||
    (() => {
      const now = new Date();
      // A session runs Sep–Jul, so before September we are still inside the
      // session that began in the previous calendar year.
      const startYear =
        now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      return `${startYear}/${startYear + 1}`;
    })();

  const resolvedTerm = term || currentTerm?.name || 'First Term';

  let weekOfTerm = null;
  let daysToTermEnd = null;
  if (currentTerm && !term) {
    const start = new Date(currentTerm.startDate);
    const end = new Date(currentTerm.endDate);
    weekOfTerm = Math.max(
      1,
      Math.ceil((Date.now() - start.getTime()) / (7 * DAY_MS)),
    );
    daysToTermEnd = Math.max(
      0,
      Math.ceil((end.getTime() - Date.now()) / DAY_MS),
    );
  }

  return {
    academicYear: resolvedYear,
    term: resolvedTerm,
    weekOfTerm,
    daysToTermEnd,
    hasCalendar: Boolean(calendar && calendar.isPublished),
    events: calendar?.events || [],
  };
};

/**
 * Today's roll call, and whether it is better or worse than the school's own
 * recent normal. A bare "412 present" tells an admin nothing; "94% present,
 * three points below the fortnight average" tells them whether to look closer.
 */
const buildAttendance = async () => {
  const today = new Date();
  const [byStatusToday, classesMarkedToday, activeStudents, activeClasses] =
    await Promise.all([
      Attendance.aggregate([
        {
          $match: { date: { $gte: startOfDay(today), $lte: endOfDay(today) } },
        },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Attendance.distinct('class', {
        date: { $gte: startOfDay(today), $lte: endOfDay(today) },
      }),
      User.countDocuments({
        role: 'Student',
        'studentProfile.profileStatus': 'Active',
      }),
      Class.find({ isActive: true }).select('name level').lean(),
    ]);

  const counts = { Present: 0, Absent: 0, Late: 0, Excused: 0 };
  byStatusToday.forEach((row) => {
    if (row._id in counts) counts[row._id] = row.count;
  });
  const marked = Object.values(counts).reduce((a, b) => a + b, 0);
  const inAttendance = counts.Present + counts.Late;

  // Baseline: the same rate over the last ten school days, so today has
  // something honest to be compared against.
  const window = recentSchoolDays(10);
  const baselineRows = await Attendance.aggregate([
    {
      $match: {
        date: {
          $gte: startOfDay(window[window.length - 1]),
          $lte: endOfDay(window[0]),
        },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        present: {
          $sum: { $cond: [{ $in: ['$status', ['Present', 'Late']] }, 1, 0] },
        },
        total: { $sum: 1 },
      },
    },
  ]);

  const dailyRates = baselineRows
    .filter((row) => row.total > 0)
    .map((row) => (row.present / row.total) * 100);
  const baseline = dailyRates.length
    ? dailyRates.reduce((a, b) => a + b, 0) / dailyRates.length
    : null;

  const rate = pct(inAttendance, marked);

  const markedClassIds = new Set(classesMarkedToday.map(String));
  const unmarkedClasses = activeClasses.filter(
    (c) => !markedClassIds.has(String(c._id)),
  );

  return {
    ...counts,
    marked,
    rate,
    baselineRate: baseline === null ? null : Math.round(baseline * 10) / 10,
    delta: baseline === null ? null : Math.round((rate - baseline) * 10) / 10,
    activeStudents,
    classesMarked: markedClassIds.size,
    classesTotal: activeClasses.length,
    unmarkedClasses: unmarkedClasses.map((c) => ({
      _id: c._id,
      name: c.name,
      level: c.level,
    })),
    isSchoolDay: !isWeekend(today),
  };
};

/**
 * What the term is owed, what has arrived, and who is behind.
 *
 * Billed comes from `paymentService.buildFeeLedger` — the one definition of
 * expected revenue in the system (amount × the students enrolled in the class,
 * not the Payment documents that happen to exist). Everything this screen adds
 * on top is derived from that same ledger, so the overview card and the
 * financial report can never disagree about what the school is owed.
 */
const buildFees = async ({ academicYear, term }) => {
  const ledger = await buildFeeLedger({ academicYear, term });

  if (!ledger.hasStructures) {
    return {
      billed: 0,
      collected: 0,
      outstanding: 0,
      collectionRate: 0,
      studentsOwing: 0,
      overdue: { students: 0, amount: 0, structures: [] },
      hasStructures: false,
    };
  }

  const now = new Date();
  const overdueStudents = new Set();
  const overdueStructures = [];
  let overdueAmount = 0;

  ledger.structures.forEach((row) => {
    const { fee } = row;
    if (!fee.dueDate || new Date(fee.dueDate) >= now) return;
    if (row.studentsOwing === 0) return;

    row.students.forEach((s) => {
      if (s.shortfall > 0) overdueStudents.add(String(s.student));
    });

    overdueAmount += row.outstanding;
    overdueStructures.push({
      _id: fee._id,
      title: fee.title,
      dueDate: fee.dueDate,
      students: row.studentsOwing,
      amount: row.outstanding,
    });
  });

  overdueStructures.sort((a, b) => b.amount - a.amount);

  return {
    billed: ledger.billed,
    collected: ledger.collected,
    outstanding: ledger.outstanding,
    collectionRate: pct(ledger.collected, ledger.billed),
    studentsOwing: ledger.studentsOwing,
    overdue: {
      students: overdueStudents.size,
      amount: overdueAmount,
      structures: overdueStructures.slice(0, 5),
    },
    hasStructures: true,
  };
};

/**
 * Academic work that has stalled: submissions sitting unmarked, and results
 * finished but never released to the people they are about.
 */
const buildAcademics = async ({ academicYear, term }) => {
  const staleCutoff = new Date(Date.now() - 7 * DAY_MS);

  const [staleSubmissions, unpublishedResults, closedAssignments] =
    await Promise.all([
      Submission.countDocuments({
        status: 'Submitted',
        submittedAt: { $lt: staleCutoff },
      }),
      Result.countDocuments({ academicYear, term, isPublished: false }),
      Assignment.countDocuments({
        academicYear,
        term,
        isActive: true,
        dueDate: { $lt: new Date() },
      }),
    ]);

  return { staleSubmissions, unpublishedResults, closedAssignments };
};

/**
 * Announcements that were scheduled to go out and never did. Small in count,
 * large in consequence — a stuck "school closes early on Friday" notice is the
 * kind of thing an admin otherwise discovers from angry parents.
 */
const buildComms = async () => {
  const stuckAnnouncements = await Announcement.countDocuments({
    isPublished: false,
    scheduledAt: { $ne: null, $lt: new Date() },
  });
  return { stuckAnnouncements };
};

const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 };

/**
 * Turn the raw signals into a ranked worklist. Each entry names the problem,
 * quantifies it, and carries the one link that lets the admin start fixing it —
 * an item with no action is a complaint, not a dashboard row.
 */
const buildAttention = ({ context, attendance, fees, academics, comms }) => {
  const items = [];

  if (!context.hasCalendar) {
    items.push({
      id: 'calendar-missing',
      severity: 'critical',
      title: 'No published academic calendar',
      detail:
        'Terms, exam windows and holidays are unset, so dates across the school cannot be trusted.',
      count: null,
      action: { label: 'Set up calendar', to: '/admin/calendar' },
    });
  }

  if (attendance.isSchoolDay && attendance.unmarkedClasses.length > 0) {
    const names = attendance.unmarkedClasses
      .slice(0, 4)
      .map((c) => c.name)
      .join(', ');
    items.push({
      id: 'attendance-unmarked',
      severity: attendance.classesMarked === 0 ? 'critical' : 'warning',
      title: `${attendance.unmarkedClasses.length} of ${attendance.classesTotal} classes have not marked attendance`,
      detail:
        attendance.unmarkedClasses.length > 4
          ? `${names} and ${attendance.unmarkedClasses.length - 4} more.`
          : `${names}.`,
      count: attendance.unmarkedClasses.length,
      action: { label: 'Chase class teachers', to: '/admin/teachers' },
    });
  }

  if (
    attendance.marked > 0 &&
    attendance.delta !== null &&
    attendance.delta <= -5
  ) {
    items.push({
      id: 'attendance-dip',
      severity: attendance.delta <= -10 ? 'critical' : 'warning',
      title: `Attendance is ${Math.abs(attendance.delta)} points below normal`,
      detail: `${attendance.rate}% present today against a ${attendance.baselineRate}% recent average — ${attendance.Absent} students absent.`,
      count: attendance.Absent,
      action: { label: 'Review students', to: '/admin/students' },
    });
  }

  if (!fees.hasStructures) {
    items.push({
      id: 'fees-unset',
      severity: 'warning',
      title: `No fee structure for ${context.term}`,
      detail: 'Nothing can be billed or collected until fees are defined.',
      count: null,
      action: { label: 'Create fee structure', to: '/admin/fees' },
    });
  } else if (fees.overdue.students > 0) {
    items.push({
      id: 'fees-overdue',
      severity: 'critical',
      title: `₦${fees.overdue.amount.toLocaleString()} overdue from ${fees.overdue.students} students`,
      detail: fees.overdue.structures.length
        ? `Largest: ${fees.overdue.structures[0].title} — ₦${fees.overdue.structures[0].amount.toLocaleString()}.`
        : 'Fee deadlines have passed with balances outstanding.',
      count: fees.overdue.students,
      action: { label: 'Chase payments', to: '/admin/payments' },
    });
  } else if (fees.collectionRate < 60) {
    items.push({
      id: 'fees-slow',
      severity: 'warning',
      title: `Only ${fees.collectionRate}% of term fees collected`,
      detail: `₦${fees.outstanding.toLocaleString()} still outstanding from ${fees.studentsOwing} students.`,
      count: fees.studentsOwing,
      action: { label: 'Open fees', to: '/admin/fees' },
    });
  }

  if (academics.staleSubmissions > 0) {
    items.push({
      id: 'ungraded-submissions',
      severity: academics.staleSubmissions > 50 ? 'warning' : 'info',
      title: `${academics.staleSubmissions} submissions unmarked for over a week`,
      detail: 'Students are waiting on feedback that has not come back.',
      count: academics.staleSubmissions,
      action: { label: 'Review grading', to: '/admin/results' },
    });
  }

  if (academics.unpublishedResults > 0) {
    items.push({
      id: 'unpublished-results',
      severity: 'warning',
      title: `${academics.unpublishedResults} results not released`,
      detail: `${context.term} results are entered but still hidden from parents and students.`,
      count: academics.unpublishedResults,
      action: { label: 'Publish results', to: '/admin/results' },
    });
  }

  if (comms.stuckAnnouncements > 0) {
    items.push({
      id: 'stuck-announcements',
      severity: 'info',
      title: `${comms.stuckAnnouncements} scheduled announcements never went out`,
      detail: 'Their send time has passed and they are still unpublished.',
      count: comms.stuckAnnouncements,
      action: { label: 'Review announcements', to: '/admin/announcements' },
    });
  }

  return items.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity],
  );
};

/**
 * The next fortnight, so "what should I do next" reaches past today.
 */
const buildUpcoming = (events) => {
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * DAY_MS);
  return (events || [])
    .filter((e) => {
      const start = new Date(e.startDate);
      return start >= startOfDay(now) && start <= horizon;
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))
    .slice(0, 6)
    .map((e) => ({
      title: e.title,
      type: e.type,
      color: e.color,
      startDate: e.startDate,
      endDate: e.endDate,
      daysAway: Math.round(
        (startOfDay(new Date(e.startDate)) - startOfDay(now)) / DAY_MS,
      ),
    }));
};

const buildAdminOverview = async ({ academicYear, term } = {}) => {
  const context = await resolveContext({ academicYear, term });

  const [attendance, fees, academics, comms] = await Promise.all([
    buildAttendance(),
    buildFees(context),
    buildAcademics(context),
    buildComms(),
  ]);

  const { events, ...publicContext } = context;

  return {
    context: publicContext,
    pulse: { attendance, fees },
    attention: buildAttention({ context, attendance, fees, academics, comms }),
    upcoming: buildUpcoming(events),
  };
};

module.exports = { buildAdminOverview, __test__: { buildAttention, pct } };
