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

  // The school's grading scales — the single source of truth for grading.
  // Change a boundary or a remark here and every report card, legend, grade
  // preview and promotion decision follows.
  //
  // Two scales, chosen by the class's level (gradeScaleKey below): the school
  // grades its primary section (Pre-Nursery to Basic 5) more generously than
  // its college (JSS 1 to SS 3), and its printed report cards carry both. The
  // portal used to have one A–F ladder for everyone, so no report card it
  // printed matched the school's own.
  //
  // Matched on `min` alone, highest band first (see calculateGrade): `max` is
  // only what the printed key shows.
  GRADE_SCALES: {
    primary: [
      { min: 80, max: 100, grade: 'A1', remark: 'Excellent', gradePoint: 5.0 },
      {
        min: 70,
        max: 79.99,
        grade: 'B2',
        remark: 'Very Good',
        gradePoint: 4.0,
      },
      { min: 65, max: 69.99, grade: 'B3', remark: 'Good', gradePoint: 3.5 },
      { min: 60, max: 64.99, grade: 'C4', remark: 'Credit', gradePoint: 3.0 },
      { min: 55, max: 59.99, grade: 'C5', remark: 'Credit', gradePoint: 2.5 },
      { min: 50, max: 54.99, grade: 'C6', remark: 'Credit', gradePoint: 2.0 },
      { min: 45, max: 49.99, grade: 'D7', remark: 'Pass', gradePoint: 1.5 },
      { min: 40, max: 44.99, grade: 'E8', remark: 'Pass', gradePoint: 1.0 },
      { min: 0, max: 39.99, grade: 'F9', remark: 'Fail', gradePoint: 0.0 },
    ],
    college: [
      {
        min: 90,
        max: 100,
        grade: 'A1',
        remark: 'Distinction',
        gradePoint: 5.0,
      },
      {
        min: 80,
        max: 89.99,
        grade: 'B2',
        remark: 'Distinction',
        gradePoint: 4.0,
      },
      {
        min: 75,
        max: 79.99,
        grade: 'B3',
        remark: 'Distinction',
        gradePoint: 3.5,
      },
      { min: 70, max: 74.99, grade: 'C4', remark: 'Credit', gradePoint: 3.0 },
      { min: 65, max: 69.99, grade: 'C5', remark: 'Credit', gradePoint: 2.5 },
      { min: 60, max: 64.99, grade: 'C6', remark: 'Credit', gradePoint: 2.0 },
      { min: 55, max: 59.99, grade: 'D7', remark: 'Pass', gradePoint: 1.5 },
      { min: 50, max: 54.99, grade: 'E8', remark: 'Pass', gradePoint: 1.0 },
      { min: 0, max: 49.99, grade: 'F9', remark: 'Fail', gradePoint: 0.0 },
    ],
  },

  // Which scale a class uses, by its level. Primary covers Pre-Nursery, the
  // nursery classes, KG and Basic 1–5 (they are all created as 'Primary');
  // everything else is the college.
  gradeScaleKey: (level) => (level === 'Primary' ? 'primary' : 'college'),

  // The head's comment on a report card, by the student's overall grade. The
  // A1, B2 and C5 wordings are the school's own, from its printed cards; the
  // rest follow them and are the school's to change here.
  HEAD_COMMENTS: {
    A1: 'AN EXCELLENT RESULT, KEEP IT UP',
    B2: 'VERY GOOD RESULT, YOU CAN DO BETTER THAN THIS',
    B3: 'GOOD RESULT, THERE IS ROOM FOR IMPROVEMENT',
    C4: 'GOOD RESULT, THERE IS ROOM FOR IMPROVEMENT',
    C5: 'GOOD RESULT, THERE IS ROOM FOR IMPROVEMENT',
    C6: 'A FAIR RESULT, WORK HARDER NEXT TERM',
    D7: 'A WEAK RESULT, YOU NEED TO PUT IN MORE EFFORT',
    E8: 'A WEAK RESULT, YOU NEED TO PUT IN MORE EFFORT',
    F9: 'A POOR RESULT, PLEASE SEE THE SCHOOL',
  },

  // Who signs the card: the primary section has a head teacher, the college a
  // head of school, as on the school's printed cards.
  HEAD_COMMENT_LABELS: {
    primary: "HEAD TEACHER'S COMMENT/SIGN",
    college: "HEAD OF SCHOOL'S COMMENT",
  },

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
