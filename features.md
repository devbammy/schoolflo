# SchoolFlo — feature status

What is built, what is partly built, and what is still missing. Scoped to a
production school management portal for a Nigerian secondary school.

This file is a roadmap, not a reference. For how anything below actually
works, see [DOCUMENTATION.md](DOCUMENTATION.md).

---

## Built

### Academic

- **Results & grading** — five-component scoring (1st CA, 2nd CA, Class Work,
  Project, Exam), a single `GRADE_SCALE`, weighted GPA, competition ranking,
  publish-per-class.
- **Cumulative reporting** — Second Term carries First; Third carries both,
  averaged over the terms actually present so a subject picked up mid-session
  is not punished for terms it was not offered in.
- **Continuous assessment tracking** — `/ca-tracking`, term-by-term
  progression per student.
- **Attendance** — class registers, term stamped from the academic calendar,
  one record per student per day, per-class reports.
- **Assignments & submissions** — file upload both ways, per-teacher scoping,
  marking.
- **Examination scheduling** — `/exam-schedules`, separate from the class
  timetable, with invigilation.
- **Timetables** — `/timetables`, per class and per teacher.
- **Promotion / class advancement** — `/promotions`, end-of-year progression
  with repeats and graduations, applied once, audited, keeping each student's
  class history.
- **Certificates & documents** — `/certificates`: report card, school leaving
  certificate, admission letter, character certificate, transfer certificate.
  PDF generation for the first three.
- **Library** — `/library`, book inventory, borrowing and returns.

### Administrative

- **Academic calendar** — `/calendar`. Term dates, holidays, resumption and
  closing, plus PTA meetings, sports day, cultural day and general events,
  audience-scoped.
- **Tasks & approvals** — `/tasks`. Admin assigns work to named staff; one
  document per assignee, submit → approve or send back with a reason.
- **Staff attendance & clock** — `/staff-attendance`. Clock in/out on the
  school's wall clock, lateness grace, admin corrections, daily roster where
  the absence of a record stays distinguishable from a recorded absence.
- **Search** — one box across students, staff, classes, subjects,
  assignments, tasks, announcements and books, scoped per role.
- **Admin overview** — pulse, attention items and next actions on one screen.

### Finance

- **Fee structures** — per class, per term, itemised, server-derived totals.
- **Online payment** — Paystack and Flutterwave, with a webhook as the
  authoritative settlement path and the browser redirect as a fast path.
- **Split payments** — a fee settled across instalments and across channels
  (card, cash, bank transfer) in any order, with both channels capped by the
  same balance.
- **Manual / offline payments** — recorded by an admin, accumulating onto one
  record, exempt from the gateway minimum.
- **Sequential receipts** — collision-free (`RCP-25-000042`), one per instalment,
  e-mailed with the balance left after it.
- **Expected revenue** — derived from fee structures and enrolment, not from
  payment attempts, so the collection rate means something.
- **Reconciliation** — `pnpm reconcile` audits the payment collection
  read-only and reports drift, genuine debt and abandoned attempts.

### Security & operations

- **Audit log** — every sensitive action, append-only, diffs only, nothing
  sensitive written, failures recorded alongside successes. Admin UI at
  `/admin/audit`.
- **Sessions** — one row per device, hashed refresh tokens, real logout,
  logout-everywhere, revocation on deactivation and password change.
- **Refresh token rotation** — every use mints a new token; a replayed token
  revokes the session.
- **Role-based access control** — four roles, with teacher scoping split into
  "may act on this class" and "may see its students".
- **Rate limiting** — shared across instances through MongoDB, counted per
  account, stricter on sign-in.
- **Password reset** — single-use, 10-minute tokens, and a forgot-password
  response that never reveals whether an account exists.

---

## Partly built

| Feature | What exists | What is missing |
| ------- | ----------- | --------------- |
| **School-wide analytics** | Admin overview: attendance pulse, fee collection, stalled marking, attention items | Pass rates per subject, average scores by class, attendance trends over time, teacher performance |
| **Debt ledger** | Per-student, per-fee balances, `studentsOwing` for a term, and arrears from earlier terms and sessions on the parent and student pages | A school-wide arrears report, and a per-family view |
| **SMS** | Twilio wired for announcements, skipped when unconfigured | Nigerian-first providers (Termii, Africa's Talking); no fee or result alerts by SMS |
| **Session management** | Sessions are recorded and revocable; logout-everywhere works | No endpoint or UI listing a user's active devices, so a user cannot drop one device |
| **Event management** | Calendar carries PTA meetings, sports day and general events | No RSVP tracking, no reminders |
| **Document generation** | PDFs for report card, leaving certificate, admission letter | No fee invoice a parent can present at a bank |

---

## Not built

### Administrative

- **Staff payroll** — salary records, deductions, payslips.
- **Student admission portal** — online application, document upload, an
  approval workflow with status the applicant can follow.
- **ID card generation** — printable student and staff cards.
- **Hostel / boarding** — room and bed allocation, boarding fees kept separate
  from day fees.
- **Onboarding wizard** — guided first-run setup for a new school (classes →
  subjects → students → fees).

### Communication

- **Internal messaging** — direct messages between teachers and parents, or
  admin and staff, without leaving the portal.
- **Push notifications** — real-time browser or mobile push for results, fee
  reminders and announcements.
- **WhatsApp integration** — the channel Nigerian parents actually read.

### Finance

- **Expense tracking** — school expenditure recorded against income.
- **Bursary / scholarship management** — partial waivers, scholarship
  students, per-student discounts.
- **Invoice generation** — a printable fee invoice for the bank.

### Reporting

- **Custom report builder** — admin-configurable queries ("every student with
  more than three absences this week", "every unpaid fee above ₦50,000").
- **End-of-term summary reports** — automated per-class PDFs for the
  principal.
- **Data export** — full school data to CSV or Excel, for offline records or
  migration.

### Security

- **Two-factor authentication** — OTP by SMS or email for admin and staff.
- **Sub-role permissions** — a Bursar who only sees finance, a Class Teacher
  who only sees their own class. Today `Admin` is all-or-nothing.

### Portal

- **PWA / offline** — installable on a phone, with offline attendance marking.
  This is the one that matters most where connectivity is unreliable.
- **Dark mode.**
- **Multi-school / multi-branch** — several campuses under one account.

---

## What to build next

In order, for a Nigerian secondary school running this in earnest:

1. **Admission portal** — the busiest workflow of the school year, and the
   only one still done entirely on paper.
2. **Invoice generation and a school-wide arrears report** — the two things a
   bursar asks for first. The arithmetic already exists in `feeLedgerService`
   and the balance endpoint; this is mostly presentation.
3. **PWA with offline attendance** — a register that cannot be marked when the
   network drops is a register kept on paper and typed up later, if at all.
4. **Sub-role permissions** — a Bursar with full admin rights is a control
   the audit log can only record after the fact, not prevent.
5. **Push notifications and WhatsApp/SMS alerts** — results published and fees
   due are the two messages parents want, on the channel they read.
