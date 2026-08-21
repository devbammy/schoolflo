module.exports = {
  ROLES: {
    ADMIN: 'Admin',
    TEACHER: 'Teacher',
    STUDENT: 'Student',
    PARENT: 'Parent',
  },

  TERMS: {
    FIRST: 'First Term',
    SECOND: 'Second Term',
    THIRD: 'Third Term',
  },

  ATTENDANCE_STATUS: {
    PRESENT: 'Present',
    ABSENT: 'Absent',
    LATE: 'Late',
    EXCUSED: 'Excused',
  },

  EXAM_TYPES: {
    CA1: 'CA1',
    CA2: 'CA2',
    MID_TERM: 'Mid-Term',
    FINAL: 'Final',
  },

  PAYMENT_STATUS: {
    PENDING: 'Pending',
    PAID: 'Paid',
    PARTIAL: 'Partial',
    OVERDUE: 'Overdue',
  },

  PAYMENT_GATEWAY: {
    PAYSTACK: 'Paystack',
    FLUTTERWAVE: 'Flutterwave',
    CASH: 'Cash',
    BANK_TRANSFER: 'Bank Transfer',
  },

  SUBMISSION_STATUS: {
    PENDING: 'Pending',
    SUBMITTED: 'Submitted',
    GRADED: 'Graded',
    LATE: 'Late',
  },

  // Tasks an admin assigns to staff. The lifecycle is:
  //   Pending → In Progress → Submitted → Completed
  // with Rejected sending it back to the teacher, and Cancelled withdrawing it.
  // A task that does not require approval skips Submitted and closes on hand-in.
  TASK_STATUS: {
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    SUBMITTED: 'Submitted',
    REJECTED: 'Rejected',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
  },

  TASK_PRIORITY: {
    LOW: 'Low',
    NORMAL: 'Normal',
    HIGH: 'High',
    URGENT: 'Urgent',
  },

  TASK_CATEGORY: {
    GENERAL: 'General',
    RESULT_ENTRY: 'Result Entry',
    ATTENDANCE: 'Attendance',
    LESSON_PLAN: 'Lesson Plan',
    REPORT: 'Report',
    MEETING: 'Meeting',
    DOCUMENT: 'Document',
    OTHER: 'Other',
  },

  // Staff clock-in / clock-out.
  //
  // The school runs on West Africa Time, which has no daylight saving, so a
  // fixed offset is enough to turn an instant into the school's wall clock —
  // and the wall clock is what decides both which day a record belongs to and
  // whether an arrival counts as late. Comparing a UTC timestamp against a
  // local start time would mark an 08:00 arrival late by exactly the offset.
  STAFF_ATTENDANCE: {
    // Minutes east of UTC. WAT is UTC+1.
    TIMEZONE_OFFSET_MINUTES: Number(
      process.env.SCHOOL_UTC_OFFSET_MINUTES ?? 60,
    ),

    // School-local wall-clock times, 24h.
    DAY_START: process.env.SCHOOL_DAY_START || '08:00',
    DAY_END: process.env.SCHOOL_DAY_END || '15:30',

    // Arriving inside the grace window still counts as Present. Traffic is
    // not a disciplinary matter.
    LATE_GRACE_MINUTES: Number(process.env.SCHOOL_LATE_GRACE_MINUTES ?? 10),

    // 0 = Sunday. Used only to label a day as a non-working one; staff who
    // come in on a Saturday are never stopped from clocking in.
    WORKING_DAYS: [1, 2, 3, 4, 5],
  },

  ANNOUNCEMENT_TARGET: {
    ALL: 'All',
    ADMIN: 'Admin',
    TEACHER: 'Teacher',
    STUDENT: 'Student',
    PARENT: 'Parent',
  },

  // Nigerian grading scale — the single source of truth for grading.
  // Change a boundary or a grade point here and every report card, GPA and
  // transcript in the system follows.
  GRADE_SCALE: [
    { min: 70, max: 100, grade: 'A', remark: 'Distinction', gradePoint: 5.0 },
    { min: 60, max: 69, grade: 'B', remark: 'Credit', gradePoint: 4.0 },
    { min: 50, max: 59, grade: 'C', remark: 'Merit', gradePoint: 3.0 },
    { min: 45, max: 49, grade: 'D', remark: 'Pass', gradePoint: 2.0 },
    { min: 40, max: 44, grade: 'E', remark: 'Weak Pass', gradePoint: 1.0 },
    { min: 0, max: 39, grade: 'F', remark: 'Fail', gradePoint: 0.0 },
  ],

  // Per-component maximums that every score entry is validated against.
  // 1st CA 10 + 2nd CA 10 + Class Work 10 + Project 10 + Exam 60 = 100.
  SCORE_BREAKDOWN: {
    CA1_MAX: 10,
    CA2_MAX: 10,
    CLASS_WORK_MAX: 10,
    PROJECT_MAX: 10,
    EXAM_MAX: 60,
    TOTAL_MAX: 100,
  },
};
