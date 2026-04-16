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

  ANNOUNCEMENT_TARGET: {
    ALL: 'All',
    ADMIN: 'Admin',
    TEACHER: 'Teacher',
    STUDENT: 'Student',
    PARENT: 'Parent',
  },

  // Nigerian grading scale
  GRADE_SCALE: [
    { min: 70, max: 100, grade: 'A', remark: 'Distinction' },
    { min: 60, max: 69, grade: 'B', remark: 'Credit' },
    { min: 50, max: 59, grade: 'C', remark: 'Merit' },
    { min: 45, max: 49, grade: 'D', remark: 'Pass' },
    { min: 40, max: 44, grade: 'E', remark: 'Weak Pass' },
    { min: 0,  max: 39, grade: 'F', remark: 'Fail' },
  ],

  SCORE_BREAKDOWN: {
    CA1_MAX: 10,
    CA2_MAX: 10,
    MID_TERM_MAX: 10,
    EXAM_MAX: 70,
    TOTAL_MAX: 100,
  },
};
