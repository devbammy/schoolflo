# SchoolFlo — Technical Documentation

**Stack:** Node.js · Express · MongoDB (Mongoose) · React 18 (Vite) · Zustand
**Package manager:** pnpm (see [Working on this repo](#working-on-this-repo) — using npm here will break your `node_modules`)

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Project structure](#2-project-structure)
3. [Getting started](#3-getting-started)
4. [Working on this repo](#working-on-this-repo)
4a. [School profiles and feature flags](#4a-school-profiles-and-feature-flags)
5. [Request lifecycle](#5-request-lifecycle)
6. [Grading](#6-grading)
7. [Payments](#7-payments)
8. [Authentication & sessions](#8-authentication--sessions)
9. [Role-based access control](#9-role-based-access-control)
10. [API reference](#10-api-reference)
10a. [Audit log](#10a-audit-log)
11. [Database schema](#11-database-schema)
12. [File storage](#12-file-storage)
13. [Notifications & the job queue](#13-notifications--the-job-queue)
14. [Environment variables](#14-environment-variables)
15. [Testing](#15-testing)
16. [Deployment](#16-deployment)
17. [Known gaps](#17-known-gaps)

---

## 1. Architecture

```
┌──────────────────────────────────────────────────────────┐
│                React Frontend (Vite)                     │
│  Zustand (persisted auth) │ React Router │ SCSS          │
│  Route-level code splitting via React.lazy               │
│  Role dashboards: Admin │ Teacher │ Student │ Parent     │
└───────────────────────┬──────────────────────────────────┘
                        │ HTTPS / REST (JWT Bearer)
┌───────────────────────▼──────────────────────────────────┐
│               Node.js + Express API (v1)                 │
│  helmet │ cors │ rate limit │ hpp │ mongo-sanitize       │
│  routes ▸ validators ▸ controllers ▸ services ▸ models   │
└────────┬─────────────────────────────┬───────────────────┘
         │ Mongoose                    │ External
┌────────▼─────────┐        ┌──────────▼───────────────────┐
│  MongoDB Atlas   │        │  Cloudinary (files)          │
│  + Agenda jobs   │        │  Paystack / Flutterwave      │
└──────────────────┘        │  Nodemailer (SMTP)           │
                            │  Twilio (SMS, optional)      │
                            └──────────────────────────────┘
```

### Layering

Every request follows the same path. Each layer has one job:

| Layer          | Responsibility                                                        |
| -------------- | --------------------------------------------------------------------- |
| **Route**      | Path, HTTP verb, and the middleware chain. No business logic.          |
| **Validator**  | Shape and range of the request. Rejects bad input before it reaches a controller. |
| **Controller** | Authorization, orchestration, response shape.                          |
| **Service**    | Reusable domain logic and all external I/O (gateways, SMTP, Cloudinary). |
| **Model**      | Schema, indexes, and invariants enforced in hooks.                     |

Controllers do not use try/catch. `express-async-errors` forwards any thrown
error to the global handler, which decides the status code and what the client
is allowed to see. Throw `AppError` for expected failures; anything else is
treated as an unexpected fault.

---

## 2. Project structure

```
schoolflo/
├── .github/workflows/ci.yml       # lint · format · test · build
├── .prettierrc.json
├── backend/
│   ├── server.js                  # Express entrypoint, middleware order
│   ├── jest.config.js
│   ├── .eslintrc.json
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.js
│   │   │   ├── env.js             # refuses to boot on a bad environment
│   │   │   ├── features.js        # which features this school runs
│   │   │   ├── clientUrl.js       # the one address for links
│   │   │   └── constants.js       # roles, terms, GRADE_SCALE, score caps
│   │   ├── models/                # 25 Mongoose models in 21 files
│   │   ├── controllers/           # 25 controllers
│   │   ├── services/              # 14 services
│   │   │   ├── gradingService.js      # class stats, ranking, report cards
│   │   │   ├── paymentService.js      # gateways + settlement
│   │   │   ├── feeLedgerService.js    # what the school is owed (see §7)
│   │   │   ├── adminOverviewService.js
│   │   │   ├── auditService.js        # record(), diff(), redaction
│   │   │   ├── searchService.js       # cross-domain search and its scoping
│   │   │   ├── notificationService.js # SMTP transport + email templates
│   │   │   ├── jobQueue.js            # Agenda-backed background email
│   │   │   ├── fileService.js         # multer + Cloudinary
│   │   │   ├── pdfService.js          # report cards, certificates
│   │   │   ├── caTrackingService.js
│   │   │   ├── examScheduleService.js
│   │   │   ├── promotionService.js
│   │   │   └── userImportService.js   # CSV validation and account creation
│   │   ├── middleware/
│   │   │   ├── auth.js            # protect()
│   │   │   ├── rbac.js            # authorize(), ownDataOnly()
│   │   │   ├── requireFeature.js  # 404 for a feature this school does not run
│   │   │   ├── validate.js        # express-validator runner
│   │   │   ├── rateLimitStore.js  # Mongo-backed, shared across instances
│   │   │   ├── rateLimitKeys.js   # what each limit counts
│   │   │   └── errorHandler.js
│   │   ├── validators/            # request schemas, grouped by domain
│   │   ├── routes/                # thin routers, one file per domain
│   │   └── utils/
│   │       ├── AppError.js
│   │       ├── apiResponse.js
│   │       ├── scoreValidation.js
│   │       ├── teacherScope.js    # the one definition of a teacher's scope
│   │       ├── studentAccess.js   # who may see a student's records
│   │       ├── enrolment.js       # who is enrolled, class in a past session
│   │       ├── parentLookup.js    # every parent of a student
│   │       ├── csv.js             # hand-written CSV reader and writer
│   │       ├── migrateEnrolments.js
│   │       ├── migrateCertificatePdfs.js
│   │       ├── schoolTime.js      # school wall clock (staff attendance)
│   │       ├── reconcilePayments.js
│   │       └── ms.js
│   └── tests/                     # 39 suites, 614 tests
│       ├── unit/                  # grading, validation, error handling
│       ├── integration/           # real in-memory MongoDB
│       └── setup/                 # one shared MongoDB, a database per suite
└── client/                        # NOTE: "client", not "frontend"
    ├── src/
    │   ├── App.jsx                # routes, lazy loading, ErrorBoundary
    │   ├── store/authStore.js     # Zustand, persisted
    │   ├── store/featureStore.js  # the feature set, read from the server
    │   ├── services/api.js        # axios + auth bridge + service modules
    │   ├── components/
    │   ├── pages/{auth,admin,teacher,student,parent,shared}/
    │   └── styles/main.scss
    └── vite.config.js
```

---

## 3. Getting started

### Prerequisites

- Node.js 18+
- pnpm 10+ (`npm install -g pnpm`)
- MongoDB Atlas cluster, or local MongoDB 6+
- Cloudinary account
- Paystack account (Nigerian payment gateway)

### Backend

```bash
cd backend
cp .env.example .env    # fill in every variable — see section 14
pnpm install
pnpm dev                # starts on :5000
```

### Client

```bash
cd client
pnpm install
pnpm dev                # starts on :5173
```

### First admin account

Registration requires an existing Admin, so the first one is seeded. Set
`SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` first:

```bash
cd backend && pnpm seed
```

The seed makes the first admin only, and refuses once one exists. Every
further admin is added on **People → Administrators** in the portal, which
creates the account through `POST /auth/register` with role `Admin` and emails
its starting password. Deactivating one there signs them out at once. The
server refuses an admin deactivating themselves and refuses to deactivate the
last active admin, so a school cannot lock itself out from that page.

### Windows

The tests need the Microsoft Visual C++ Redistributable:

```powershell
winget install --id Microsoft.VCRedist.2015+.x64 --exact
```

Without it `pnpm test` reports `Module <rootDir>/tests/setup/globalSetup.js in the
globalSetup option was not found`, about a file that exists. Jest's native
resolver cannot load, and its WebAssembly fallback cannot see Windows paths.
`mongod` needs the same runtime and exits with code `3221225781`.

---

## Working on this repo

**Use pnpm, not npm.** `node_modules` is pnpm-managed. Running `npm install`
or `npm uninstall` against it fails with an opaque internal error
(`Cannot read properties of null (reading 'matches')`) and can leave the tree
inconsistent.

| Task              | Command                    |
| ----------------- | -------------------------- |
| Install           | `pnpm install`             |
| Add a dependency  | `pnpm add <pkg>`           |
| Run tests         | `pnpm test`                |
| Coverage          | `pnpm test:coverage`       |
| Lint              | `pnpm lint`                |
| Format            | `pnpm format`              |
| Audit payments    | `pnpm reconcile`           |
| Repair payments   | `pnpm reconcile:apply`     |
| Report missing class history | `pnpm migrate:enrolments` |
| Write class history | `pnpm migrate:enrolments:apply` |
| Report public certificate PDFs | `pnpm migrate:certificates` |
| Move them into the database | `pnpm migrate:certificates:apply` |

CI runs lint, a dependency audit, the format check and tests for the backend, and
lint, a dependency audit and the build for the client, on every push and pull
request to `main`.

---

## 4a. School profiles and feature flags

SchoolFlo is one codebase deployed once per school, and schools do not all
want the same portal. A school is a **configuration, never a branch**: a
branch whose customisation is deleted code turns every upstream change into a
merge conflict, and the schools on old branches are the ones that quietly stop
getting security patches.

`src/config/features.js` is the single source. Everything is on by default, so
a deployment that sets nothing behaves exactly as the full product does.

```
SCHOOL_PROFILE=office-fees          # a named profile
FEATURE_STAFF_ATTENDANCE=true       # per-feature override, last word
```

Resolution order, last wins: **all on → profile → `FEATURE_*` override.**
An unknown `SCHOOL_PROFILE` throws at boot rather than silently shipping the
full product to a school that asked for less.

| Feature | Off removes | Off does **not** remove |
| ------- | ----------- | ----------------------- |
| `onlinePayments` | `/payments/initialize/*`, `/payments/verify/*`, `/webhooks` | Fee structures, `POST /payments/manual`, balances, receipts, the financial report |
| `staffAttendance` | The whole `/staff-attendance` domain, the teacher clock, the admin roster, the clock panel on a teacher's profile | Student attendance, which is unrelated |
| `resultsRequireFees` (**off** by default) | When **on**, a student or parent cannot see or print a term's result while that term's fee, or any earlier fee, has a balance. See [Results held back over fees](#results-held-back-over-fees) | Anything for staff, who always see results |

Profiles shipped today: `full` (default) and `office-fees` (fees collected at
the school office, no staff clock).

### Results held back over fees

`FEATURE_RESULTS_REQUIRE_FEES=true`. The only switch that defaults **off**:
the others add something, this one withholds something, and defaulting it on
would have locked every existing school's report cards on upgrade.

**The rule** (`services/resultAccessService.js`): a term's result is locked
for a student or parent while that term's fee, or any fee from before it, has
anything outstanding. Paying next term early is not needed to see this one, but
an old debt cannot be skipped by paying the newest fee. Part-paid is not paid.
A class with no fee set locks nobody. Which fees count is
`paymentService.billedFeesFor()`, the same list the fee page shows, so a
family is never locked over a debt they cannot see.

**Where it applies**, because a lock on the report card alone is undone by any
other page that shows the same numbers:

| Surface | When locked |
| --- | --- |
| `GET /results/report-card/:id` (view and print) | **402** with `errors: { reason: 'FEES_OUTSTANDING', term, academicYear, outstanding, fees }` |
| `GET /results/student/:id/history` | The term moves to `locked`, without its scores |
| CA tracking (`/ca-tracking/student`, `/analytics`, `/chart`) | 402 while any term in the year that has results is locked: the yearly figures would give it away |
| Student and parent dashboards | No scores or average for a locked term, and `resultsLock` says why |
| The "results published" email | A parent who owes gets `resultWithheld`: results are ready, the balance, **no average or position** |

402, not 403: the viewer may see this child's results, and what is in the way
is a debt, so the client shows the balance and a link to the fee page
(`components/common/ResultsLocked.jsx`).

**Exceptions.** An admin can release one student's results despite the balance
from the student's profile (`PUT /users/:id/results-release`), for a
scholarship or a payment plan. Stored as `studentProfile.resultsRelease`
(who, when, an optional note), audited as `results.release` and
`results.release_withdrawn` against the student, and withdrawable. Without
it, the office's only way to release a report card was to record a payment that
never happened.

### How a feature is enforced

Two mechanisms, and which one to use depends on the shape of the feature:

- **A whole domain** — do not mount its router in `server.js`. There is no
  route left to guard, and the domain is unreachable by construction.
- **A feature inside a router the school still needs** — guard those specific
  routes with `requireFeature('name')`. Online payment is this case: the
  gateway routes sit alongside manual payments and the fee ledger, which a
  cash-collecting school uses daily.

`requireFeature` answers **404, not 403**, and sits **ahead of `protect`**. A
feature this deployment does not run should be indistinguishable from a route
that was never mounted — which is what a disabled domain looks like — and that
means the same answer for everyone, signed in or not, with no database round
trip first. 403 would imply a permission the caller might be granted.

### The client

`GET /api/v1/config` (public) serves the resolved feature set;
`store/featureStore.js` fetches it once before the app renders. The client
does **not** carry a `VITE_FEATURES` copy — same rule as the grading scale,
two copies of one truth in two deployables will drift.

A nav entry or quick action opts in with a `feature:` tag and is filtered out
when it is off, along with any section left empty. A quick action may declare
a `fallback` label instead of disappearing: with gateways off, "Make a
Payment" becomes "Fee Balance", because the page is still where a parent finds
out what they owe. `FeatureRoute` in `App.jsx` redirects a disabled page, so
a bookmark or an old email link does not land on a screen firing 404s.

**Hiding a nav item is cosmetic. The server-side guard is the actual
control** — and it is the one under test.

### Adding a feature

1. A key in `FEATURES` in `src/config/features.js`, defaulting to `true`.
2. Either skip mounting the router, or add `requireFeature` to its routes.
3. A `feature:` tag on the client nav entry and quick action.
4. A case in `tests/integration/features.test.js` proving the route actually
   closes.

---

## 5. Request lifecycle

Middleware order in `server.js` is deliberate:

```
helmet
  → cors            (exact-match allowlist; substring matching is a vulnerability)
  → compression
  → /webhooks       (BEFORE express.json — HMAC needs the raw body)
  → express.json
  → mongo-sanitize, hpp
  → morgan
  → rate limit      (/api only, so webhooks are never throttled;
                     counters in MongoDB, shared across instances)
  → routes
  → 404
  → errorHandler
```

### Error handling

| Thrown                     | Client sees                                  |
| -------------------------- | -------------------------------------------- |
| `AppError.badRequest(msg)` | 400 with `msg`                               |
| `AppError.unauthorized()`  | 401                                          |
| `AppError.forbidden(msg)`  | 403 with `msg`                               |
| `AppError.notFound(msg)`   | 404 with `msg`                               |
| `AppError.conflict(msg)`   | 409 with `msg`                               |
| Mongoose `ValidationError` | 400, field messages                          |
| Mongoose `CastError`       | 400 ("'x' is not a valid id")                |
| Duplicate key (11000)      | 409, naming the field                        |
| Anything else              | **500, generic message.** Full detail logged server-side only. |

Unexpected faults never expose `err.message` to the caller.

---

## 6. Grading

### Score breakdown

| Component     | Max    |
| ------------- | ------ |
| 1st CA        | 10     |
| 2nd CA        | 10     |
| Class Work    | 10     |
| Project       | 10     |
| Exam          | 60     |
| **Total**     | **100**|

Caps live in `SCORE_BREAKDOWN` (`config/constants.js`) and are enforced in two
places that both read from it: `utils/scoreValidation.js` (every write path)
and `validators/resultValidators.js` (the request edge).

### Grading scale

`GRADE_SCALE` in `config/constants.js` is the **single source of truth**. The
report-card legend in `pdfService` is generated from it, and `calculateGrade`
derives from it — there is no second ladder to keep in sync.

| Score  | Grade | Remark      | Grade point |
| ------ | ----- | ----------- | ----------- |
| 70–100 | A     | Distinction | 5.0         |
| 60–69  | B     | Credit      | 4.0         |
| 50–59  | C     | Merit       | 3.0         |
| 45–49  | D     | Pass        | 2.0         |
| 40–44  | E     | Weak Pass   | 1.0         |
| 0–39   | F     | Fail        | 0.0         |

### Ranking

Positions use **competition ranking**: tied students share a position and the
next position skips accordingly (82, 82, 79 → 1, 1, 3). Overall averages are
rounded to 2dp before ranking, so two students separated only by floating-point
noise are treated as the tie they are.

### Cumulative results

Report cards accumulate down the session: a **Second Term** card carries First
Term with it, and a **Third Term** card carries First and Second. First Term
has nothing behind it, so `generateReportCard` returns `cumulative: null` there
and every renderer omits the section.

```
subject cumulative = mean of that subject's term scores present in the window
student cumulative = mean of that student's subject cumulatives
```

Averaging over the terms actually present (rather than treating a missing term
as a zero) means a subject picked up mid-session is not punished for the terms
it was not offered in. Because the cumulative stays on a 0–100 scale, the same
`GRADE_SCALE` bands, remarks and grade points apply to it, and cumulative
position uses the same competition ranking as the termly position.

The legend travels with the card. `GET /results/report-card/:studentId`
returns `gradeScale` (the `GRADE_SCALE` rows) and `summary.principalComment`
alongside the results, and `PrintableReportCard` renders both from that
payload. It used to hold its own hardcoded copy of the ladder and its own
comment thresholds, so a school adjusting the scale got a card whose grades
and whose legend disagreed. The client cannot import backend constants, so the
server sends them rather than the client guessing.

`computeCumulative` (`services/gradingService.js`) reads only **published**
results, so an unpublished term never leaks into a parent-facing card. It is
surfaced by `GET /results/report-card/:studentId` as `cumulative`, printed as a
second table on the PDF, and rendered in `PrintableReportCard`, `ViewResults`
and the admin report-card modal.

### GPA

```
GPA = Σ(gradePoint × creditUnit) / Σ(creditUnit)
```

Weighted by `Subject.creditUnit`, which defaults to 1.

### Publishing

```
POST /results/publish { class, term, academicYear }
  1. computeClassStatistics over the FULL cohort for that term
     (not just unpublished rows — otherwise re-publishing one correction
      recomputes the class average from that single row)
  2. per-subject average / highest / lowest + competition ranks
  3. one bulkWrite for all stat updates
  4. isPublished = true
  5. background: CA tracker sync + parent emails (queued, not inline)
```

---

## 7. Payments

### Settlement

`settlePayment()` in `paymentService.js` is the **single settlement path**.
Both the browser redirect and the gateway webhook call it.

```
init    → server computes outstanding = totalAmount − Σ(paid)
        → a client-supplied `amount` is only a part-payment REQUEST and is
          rejected if it exceeds the outstanding balance
        → Payment{status:Pending, amountDue:outstanding, transactionRef}

pay     → Paystack checkout
        ├─ WEBHOOK  POST /webhooks/paystack   ← authoritative, retried
        └─ REDIRECT POST /payments/verify/paystack ← fast path, best effort

settle  → idempotent: if already Paid, return unchanged
        → verify with the gateway; assert success, NGN, positive amount
        → payment.save()  ← the pre('save') hook derives balance and status
```

Two rules that matter:

- **Never `findOneAndUpdate` a Payment.** It bypasses the `pre('save')` hook
  that derives `balance` and `status`. Hardcoding `status: 'Paid'` is how an
  underpayment used to clear a full debt.
- **The client never defines what is owed.** `resolvePayableAmount()` is the
  only authority.

Receipt numbers are sequential and collision-free: `RCP-25-000042`, backed by
the atomic `Sequence` model.

### Split payments

A fee does not have to be settled in one go, or through one channel. A family
can pay part of it by card and hand the rest over at the school office, in any
order and across as many instalments as they need.

That makes **no single Payment document the answer to "is this fee paid?"**. A
₦20,000 instalment against a ₦45,000 fee is a document with
`amountDue === amountPaid`, so its own status is `Paid` while ₦25,000 is still
owed. Reading a record's status as the fee's status is the bug this model
exists to prevent.

The authority is `describeFeeBalance()` / `getFeeBalances()` in
`paymentService.js`, served to clients by:

```
GET /api/v1/payments/balance/:studentId?term=&academicYear=
GET /api/v1/payments/balance/:studentId?feeStructureId=   ← one named fee

→ { balances: [{ feeStructure, totalAmount, paidOnline, paidOffline,
                 paidTotal, outstanding, status, percentPaid,
                 minimumOnlinePayment }],
    totals: { ... } }
```

- `paidOnline` is Paystack + Flutterwave; `paidOffline` is Cash + Bank
  Transfer. The split is what the parent and student pages draw their progress
  bars from, and what the office sees before taking cash.
- **Both channels are capped by the same balance.** `resolvePayableAmount()`
  guards the manual/cash route as well as the gateways, so cash cannot be
  recorded on top of money already paid online.
- The gateway floor (`MIN_PAYMENT_NGN`) applies to a part-payment that leaves
  a balance behind, never to a payment that clears the fee — otherwise a ₦40
  remainder could never be paid off. Cash is exempt entirely
  (`enforceMinimum: false`).
- Each e-receipt reports **that instalment** and the balance left after it, under
  **its own receipt number**. Over-the-counter payments accumulate onto one
  record per method, so its `amountPaid` is a running total. `Payment.instalments`
  holds each sum: amount, receipt, date, who took it and any note. It always adds
  up to `amountPaid`; a record from before instalments were kept has what it
  already held written as the first entry the next time money is added.
- **A fee follows the session, not the current class.** A student owes a fee if
  they were in its class that session (`utils/enrolment.js`), so promotion cannot
  make a debt disappear. Asking about a term also returns `arrears` and
  `arrearsTotal`: what is still owed from earlier terms and sessions, shown on
  the parent and student pages as "Earlier balances".

**Webhook setup:** register `https://<your-api-host>/webhooks/paystack` in the
Paystack dashboard. Without it, a payment is only confirmed if the payer
returns to the site.

### What the school is owed

`totalExpected` is **not** summed from Payment documents. `buildFeeLedger()`
in `services/feeLedgerService.js` is the one definition of expected revenue,
and it derives it from the fee structures and the roster they apply to:

```
billed      = Σ over active fee structures of (fee.totalAmount × students in its class that session)
collected   = Σ min(what that student paid toward that fee, the fee total)
outstanding = billed − collected
```

Summing `Payment.amountDue` instead measured payment *attempts*. Every
abandoned checkout leaves a Pending row behind, so a parent who opened the
payment page four times and paid once quadrupled the school's expected
revenue — while a student nobody had raised a payment for contributed nothing
at all, so a school that had billed everyone and collected from nobody
reported a 100% collection rate against ₦0 expected.

Collection is capped per student per fee, so a duplicate payment on one child
cannot subsidise another child's debt in the headline rate.

"In its class that session" comes from `studentProfile.enrolments`, falling back
to the current class for sessions after the last recorded one. Reading the current
roster alone meant applying a promotion rewrote the report for a closed session:
last year's JSS2 fee was billed to this year's JSS2, and the cohort who actually
owed it dropped out of the figure. A graduate's final-year debt stays in the
ledger; later sessions do not bill them.

Both `GET /payments/report` and the admin overview card read from this one
function, so the two screens cannot drift into disagreeing about the same
number. Abandoned attempts are still counted and reported, as
`overview.abandonedAttempts` — housekeeping, not debt.

For what an individual student owes, the authority is still
`getFeeBalances()`; `buildFeeLedger()` answers the school-wide question.

### Reconciliation

`pnpm reconcile` audits the payment collection and prints a report. It is
**read-only** until you pass `--apply`, and never deletes anything.

It reports two independent things:

- **Record drift** — payments whose stored `status`/`balance` disagree with
  what the schema would derive from `amountPaid` vs `amountDue`. Records marked
  `Paid` while under-collected are called out separately, with the total
  shortfall: that is the signature of the pre-fix settlement bug.
- **Ledger** — what was actually collected per student per fee structure,
  summed from `amountPaid` and compared against the fee total. This ignores
  every status field, so it tells you who genuinely still owes money even when
  the records claim otherwise.

It also counts abandoned gateway attempts (initialised, never paid). These
inflate `totalExpected` in the financial report, but are deliberately **not**
deleted — a late webhook for an abandoned-then-completed attempt would lose a
real payment.

Overpayments (more collected than the fee is worth, usually a duplicate) are
reported for a human to decide on, never auto-adjusted.

```bash
pnpm reconcile          # report only
pnpm reconcile:apply    # correct the drifted records
pnpm reconcile -- --json
```

Corrections re-save each record so the schema hook derives `balance` and
`status`. `amountPaid` is never rewritten — the money that came in is the one
fact that is trusted. Running it twice is safe: the second run finds nothing.

---

## 8. Authentication & sessions

- **Access token** — JWT, default **1 hour**. Not revocable, so its lifetime is
  its blast radius. Overridden by `JWT_EXPIRE`.
- **Refresh token** — JWT, default **30 days**, and only valid while a matching
  `Session` row exists. **Rotated on every use.**
- **Sessions** — one row per signed-in device, storing a SHA-256 hash of the
  refresh token. A dump of the collection cannot be replayed.

### Students with no email

Most pupils have no address of their own, and one school's registration sheet
gave two-thirds of them a parent's or a sibling's instead. One address is one
account, so those rows could never all import.

So a student may have **no email**. They sign in with their **admission
number**, and the admin hands them a password on a **printed login slip**.

| Piece | Where |
| --- | --- |
| The account's address | A placeholder, `student-<id>@no-email.invalid`, set in `User` `pre('validate')`. `.invalid` is reserved (RFC 2606) and never delivers. `email` stays required and unique, so the production index is unchanged. |
| "Does this account have a mailbox?" | `utils/mailbox.js` `hasMailbox()`. `sendEmail` and `enqueueEmail` both skip a placeholder, so nothing is queued and retried for an address that cannot receive. |
| The sign-in box | `POST /auth/login` takes `identifier`: an email if it has an `@`, otherwise an admission number. `email` is still read for older clients. An admission number only ever finds a `role: 'Student'`. |
| Normalising what was typed | `utils/loginIdentifier.js`. Upper case, spaces removed: a phone types "Ao 260012". The login limiter keys on the same value, so each spelling does not get its own budget. |
| The password on a slip | `utils/loginPassword.js`: two words from a 256-word list and two digits, about 22.6 bits. Enough against the per-account limiter; the student may change it whenever they like. Emailed passwords stay random characters. |
| Printing | `components/common/LoginSlips.jsx`, two slips across an A4 portrait page, sorted by class then name. |
| A lost slip | `POST /users/:id/login-slip` (Admin): a new password, every session ended, audited as `auth.login_slip`. *Forgot password* cannot help, as there is nowhere to send the link. |

A slip password exists in clear in exactly one place: the response that created
it, sent with `Cache-Control: no-store`. Not the database, not the audit log,
not an email. Closing the import window before printing loses them, and the
client asks first.

**One shared password for every student was asked for, and refused.**
Admission numbers are initials, the year and a counter, so they are trivial to
guess, and with one password any pupil could open any other child's results,
fees and certificates, or change that password and lock them out.

Searching by email skips placeholders (`emailMatches()`); otherwise "student"
matched every pupil with no address. The client shows nothing in place of a
placeholder (`client/src/utils/mailbox.js`).

### Refresh token rotation

`POST /auth/refresh` mints a new refresh token, retires the one presented, and
returns **both** tokens. A client that keeps the old one will be signed out on
its next refresh, so the client stores what comes back
(`services/api.js` and `store/authStore.js`).

The retired hash is kept on the session as `previousTokenHash`, which is what
makes two things possible:

| A retired token arrives | Within 60s of rotation | After 60s |
| ----------------------- | ---------------------- | --------- |
| Interpretation          | A race — a second tab, or a retried request | A replay — the token leaked |
| Response                | A fresh access token, no second rotation | 401, **the whole session is deleted**, `auth.refresh_reuse` audited |

The grace window is not optional. Two browser tabs share one refresh token
through `localStorage` and will both present it when their access tokens
expire together; without it the loser of that race is signed out of a session
they are actively using. `Session.ROTATION_GRACE_MS` holds the value.

Rotation swaps the hash with an atomic `findOneAndUpdate` matched on the old
one, so two requests that reach that point together cannot both mint a token
against the same session.

A rotated token **inherits the original `expiresAt`**. Sliding the expiry
forward on every use would mean a session in daily use never ends, which is
the opposite of what a 30-day limit is for.

Refresh tokens carry a random `jti`. Without it the payload is just `{ id }`
plus whole-second `iat`/`exp`, so two tokens minted for one user inside the
same second are byte-identical — they collide on `Session.tokenHash`'s unique
index, and rotation cannot replace a row with a token that hashes to it.

This is what makes logout real:

| Action                     | Effect                                  |
| -------------------------- | --------------------------------------- |
| `POST /auth/logout`        | Deletes that device's session           |
| `POST /auth/logout-all`    | Deletes every session for the user      |
| Deactivating a user        | Deletes all their sessions              |
| Deleting a user            | Deletes all their sessions              |
| Changing a password        | Invalidates tokens issued before it     |

Sessions expire from MongoDB automatically via a TTL index.

---

## 9. Role-based access control

`authorize(...roles)` gates by role. Ownership is checked inside controllers,
because "own data" means something different per domain.

| Resource               | Admin | Teacher                | Student  | Parent      |
| ---------------------- | ----- | ---------------------- | -------- | ----------- |
| Create / delete users  | ✅    | ❌                     | ❌       | ❌          |
| View all students      | ✅    | ✅                     | ❌       | ❌          |
| Mark attendance        | ✅    | ✅                     | ❌       | ❌          |
| Enter grades           | ✅    | own subjects only      | ❌       | ❌          |
| View class results     | ✅    | own subjects only      | ❌       | ❌          |
| Publish results        | ✅    | ❌                     | ❌       | ❌          |
| View results           | ✅    | ✅                     | own      | own child   |
| View attendance        | ✅    | ✅                     | own      | own child   |
| View submissions       | ✅    | own assignments        | own      | own child   |
| Manage assignments     | ✅    | own only               | ❌       | ❌          |
| Manage exams           | ✅    | own only               | ❌       | ❌          |
| Create fees            | ✅    | ❌                     | ❌       | ❌          |
| Pay fees               | ✅    | ❌                     | own      | own child   |
| Record manual payment  | ✅    | ❌                     | ❌       | ❌          |
| Financial report       | ✅    | ❌                     | ❌       | ❌          |
| Library issue / return | ✅    | ✅                     | ❌       | ❌          |
| Announcements          | ✅    | create + view          | view     | view        |

**Teacher scoping** comes in two widths, and `utils/teacherScope.js` holds
both. Conflating them either breaks grade entry or hands the register to
someone who teaches one period a week.

| Question | Function | Means |
| -------- | -------- | ----- |
| May this teacher **act on** this class? | `getTeacherClassIds` / `assertClassAccess` | Form teacher of it, or class teacher of one of its sections. Marking a register, running its attendance report. |
| May this teacher **see the students of** this class? | `getTeacherRosterClassIds` / `assertRosterAccess` | The above, plus every class a subject they teach is offered in. Loading a roster to enter grades. |

**Scores** have their own rule, `canEnterScores`. Whoever owns the class (form
teacher, or class teacher of a section) may enter any subject in it. Anyone else
must teach the subject, recorded on either `teacherProfile.subjectsTaught` or
`Subject.teachers`, **and** the subject must be offered in that class
(`Subject.classes`). Reading results follows the same rule. A subject with no
classes assigned accepts scores only from the class's owner and an admin.

A score must also belong under its class: the student is in it, was in it that
session, or the row is already filed there, which keeps a correction to last
year's mark possible after the student has been promoted.

**Student data ownership** is a separate question with one answer:
`utils/studentAccess.js`. `assertStudentAccess` guards reading one student's
records; `scopeQueryToStudents` filters a list. Staff are unrestricted, a
student sees themselves, a parent sees their own children.

This matters most on a route carrying `protect` but no `authorize`, which
every role can reach. Two such routes shipped with **no ownership check at
all** — `GET /certificates` returned every certificate in the school to any
signed-in account, and the `/ca-tracking/*` handlers read the student id
straight out of the URL and never looked at `req.user`. Both were found by
driving the running server as each role, and both are now covered by
`tests/integration/studentAccess.test.js`.

`GET /users/:id` is scoped by the roster rule: a Teacher may fetch a Student
in a class they teach, and their own record. Every other id — a colleague, an
admin, a parent, a student in another class — is a 403. The route used to be
open to any Teacher for any id, which handed every teacher the full profile of
everyone in the school. `GET /users/students/class/:classId` carries the same
check, without which the first one is decoration.

---

## 10. API reference

Base URL: `/api/v1`. All routes require a Bearer token unless marked Public.

### Auth — `/auth` (9 routes)

| Method | Endpoint                 | Access | Notes                                        |
| ------ | ------------------------ | ------ | -------------------------------------------- |
| POST   | `/login`                 | Public | `{ identifier, password }`: an email, or a student's admission number. Returns `{ user, accessToken, refreshToken }`|
| POST   | `/register`              | Admin  | Sends a welcome email with the credentials. A student may have no email, and then none is sent. Returns `{ user }`, never tokens: the caller is not that person |
| GET    | `/me`                    | Any    | Fully populated profile                      |
| PUT    | `/update-password`       | Any    | New password must differ from the current one|
| POST   | `/forgot-password`       | Public | Always 200 — never reveals whether an account exists |
| PUT    | `/reset-password/:token` | Public | Token valid 10 minutes, single use           |
| POST   | `/refresh`               | Public | Requires a live session                      |
| POST   | `/logout`                | Any    | Revokes this device                          |
| POST   | `/logout-all`            | Any    | Revokes every device                         |

### Results — `/results` (6 routes)

| Method | Endpoint                      | Access                    |
| ------ | ----------------------------- | ------------------------- |
| POST   | `/`                           | Admin, Teacher (own subject) |
| POST   | `/bulk`                       | Admin, Teacher (own subject) |
| POST   | `/publish`                    | Admin                     |
| GET    | `/report-card/:studentId`     | Admin, Teacher, own, own child |
| GET    | `/class/:classId`             | Admin, Teacher (scoped)   |
| GET    | `/student/:studentId/history` | Admin, Teacher, own, own child |

`POST /results/bulk` validates every row first and rejects the **whole batch**
if any row is invalid — a half-applied set of scores is worse than none.

### Payments — `/payments` (7) and `/fees` (4)

| Method | Endpoint                    | Access                    |
| ------ | --------------------------- | ------------------------- |
| POST   | `/initialize/paystack`      | Admin, own, own child     |
| POST   | `/verify/paystack`          | Admin, own, own child     |
| POST   | `/initialize/flutterwave`   | Admin, own, own child     |
| POST   | `/manual`                   | Admin (Cash / Bank Transfer only) |
| GET    | `/student/:studentId`       | Admin, own, own child     |
| GET    | `/balance/:studentId`       | Admin, own, own child     |
| GET    | `/report`                   | Admin                     |

`GET /report` accepts `term`, `academicYear` and `classId`. Its `overview`
carries `totalExpected` / `totalCollected` / `totalOutstanding`,
`collectionRate`, `studentsBilled`, `studentsOwing` and `abandonedAttempts` —
see [What the school is owed](#what-the-school-is-owed) for where each comes
from.

`amount` is optional on initialize. Omit it to settle the outstanding balance
in full — which is what the client does.

### Audit log — `/audit` (5 routes, Admin only)

| Method | Endpoint                          | Returns                              |
| ------ | --------------------------------- | ------------------------------------ |
| GET    | `/`                               | Filtered, paginated log              |
| GET    | `/summary?days=7`                 | Recent activity, top actors, failures |
| GET    | `/actions`                        | Distinct action names, for filters   |
| GET    | `/student/:studentId`             | Everything concerning one student    |
| GET    | `/entity/:entity/:entityId`       | History of one record                |

Filters on `/audit`: `action` (prefix match — `result` finds all `result.*`),
`entity`, `entityId`, `actor`, `subject`, `outcome`, `from`, `to`.

**There is no write, update or delete route.** Entries are created by the
actions they describe and cannot be altered through the API.

The Admin UI for this lives at `/admin/audit` (sidebar → Oversight → Audit
Log): a filterable table where each row expands to show the field-level diff,
the request origin, and the reason a failed action failed.

### Tasks & approvals — `/tasks` (10 routes, staff only)

| Method | Endpoint        | Who    | Does                                        |
| ------ | --------------- | ------ | ------------------------------------------- |
| POST   | `/`             | Admin  | Assign one task per named staff member      |
| GET    | `/`             | Staff  | Paginated list — a teacher sees only theirs |
| GET    | `/stats`        | Staff  | Counts by status, plus overdue              |
| GET    | `/:id`          | Staff  | One task                                    |
| PUT    | `/:id`          | Admin  | Edit a task that is not yet closed          |
| PATCH  | `/:id/start`    | Owner  | Pending → In Progress                       |
| POST   | `/:id/submit`   | Owner  | Hand in, with an optional note              |
| POST   | `/:id/review`   | Admin  | Approve, or send back with a reason         |
| PATCH  | `/:id/cancel`   | Admin  | Withdraw a task                             |
| DELETE | `/:id`          | Admin  | Delete outright                             |

One document per assignee, never one document with an array of them: a task
given to six teachers is six pieces of work, each with its own status and
approval. Tasks created together share a `batchId`.

The lifecycle is `Pending → In Progress → Submitted → Completed`, with
`Rejected` sending it back to the teacher and `Cancelled` withdrawing it. A
task created with `requiresApproval: false` closes on hand-in instead of
queueing for a sign-off nobody reads. A rejection without a comment is refused
by the validator — a teacher cannot act on "no".

A teacher's scope is enforced in the controller, not by the query string:
passing `?assignedTo=` as a Teacher is ignored. Assignment, submission and
every review decision are written to the audit log (`task.assign`,
`task.submit`, `task.approve`, `task.reject`, `task.cancel`, `task.delete`).

UI: `/admin/tasks` (Oversight → Tasks & Approvals) to assign and review;
`/teacher/tasks` (Classroom → My Tasks) to start, submit and resubmit.

### Staff attendance — `/staff-attendance` (10 routes, staff only)

| Method | Endpoint      | Who   | Does                                          |
| ------ | ------------- | ----- | --------------------------------------------- |
| GET    | `/today`      | Staff | Own clock state, and which button is live     |
| POST   | `/clock-in`   | Staff | Record arrival, with an optional note         |
| POST   | `/clock-out`  | Staff | Record departure and the time on site         |
| GET    | `/me`         | Staff | Own history over a date range, plus a summary |
| GET    | `/daily`      | Admin | One day's roster — every active staff member  |
| GET    | `/summary`    | Admin | Per-staff totals and attendance rate          |
| GET    | `/`           | Admin | Paginated records, filtered                   |
| POST   | `/mark`       | Admin | Record or correct one person's day            |
| PATCH  | `/:id`        | Admin | Correct a record's status or times            |
| DELETE | `/:id`        | Admin | Delete a record entered in error              |

One document per staff member per day, enforced by a unique
`{staff, date}` index — two taps on the button race each other into that index
rather than into two records. None of the clock routes take a staff id: they
always act on the caller, which is the point of a clock.

**The absence of a record is meaningful.** `/daily` lists every active staff
member and reports those with no record as `Absent` with `recorded: false`, so
"the office marked them absent" stays distinguishable from "nobody accounted
for them". Nothing writes an Absent row overnight — a nightly job that quietly
stops running is worse than a gap computed on request.

**Time is the school's wall clock, not the server's.** `utils/schoolTime.js`
shifts an instant by a configured offset (WAT, UTC+1) and reads its UTC fields,
so which day a record belongs to and whether 08:12 counts as late read the same
on every machine. `date` is a day *key* — UTC midnight standing for a local
calendar day — never an instant. The offset is sent to the client with every
clock payload so a phone left on another timezone still shows school time.

An arrival inside `DAY_START` plus `LATE_GRACE_MINUTES` is `Present`, past it
`Late`; `minutesLate` is stored rather than re-derived, so a later change to
the school day does not silently rewrite history. Marking someone `Absent` or
`Excused` clears any clock times that contradict it, and a day recorded as
excused leave refuses a clock-in until an admin changes it — an admin's
decision outranks the button. Clock-ins, clock-outs and every admin correction
are written to the audit log.

Configured through the environment: `SCHOOL_DAY_START`, `SCHOOL_DAY_END`,
`SCHOOL_LATE_GRACE_MINUTES`, `SCHOOL_UTC_OFFSET_MINUTES`.

UI: `/admin/staff-attendance` (Oversight → Staff Attendance) for the daily
roster and per-staff summary; `/teacher/clock` (Classroom → Clock In / Out)
for the clock itself and a teacher's own history.

### Bulk account import — `/users/import` (4 routes, Admin only)

| Method | Endpoint             | Does                                        |
| ------ | -------------------- | ------------------------------------------- |
| GET    | `/import/columns`    | Which columns each role accepts             |
| GET    | `/import/template`   | Download a CSV template for Student/Teacher |
| POST   | `/import/preview`    | Validate an uploaded CSV. **Writes nothing** |
| POST   | `/import`            | Create accounts from reviewed rows          |

Only `Student` and `Teacher` can be imported. Admins and Parents are created
one at a time on purpose — there are few of them and they carry more privilege.

**Required columns:** `firstname`, `lastname`, and `email` for a teacher.
**Optional:** `phone` plus, for a student, `email`, `class`, `section`, `gender`,
`dateofbirth`, `address`; for a teacher, `qualification`,
`specialization`, `designation`. Headers are matched loosely, so
`First Name`, `firstname` and `FIRST_NAME` all agree. Unknown columns are
ignored rather than rejected — schools export from systems that add their own.

The two-step shape is the whole point. A file of two hundred students will have
one malformed date in it, and discovering that after half the accounts exist is
much worse than discovering it before any of them do. Preview returns a verdict
per row with the **line number as it appears in the admin's spreadsheet**
(header is line 1), and the commit step **re-validates every row from scratch**
— the preview is a courtesy to the reader, never an input the server trusts.

What preview catches: missing required fields, malformed addresses, an address
that already has an account, an address repeated **within the file** (which
would otherwise create the first and collide on the unique index for the
second), a class or section that does not exist, an out-of-range gender, an
unparseable or future date of birth.

### Parents, on the student row

A student row may also carry `parentfirstname`, `parentlastname`,
`parentemail`, `parentphone` and `parentrelationship`. Filling **any** of
them makes `parentemail` required — an account cannot exist without somewhere
to send its password.

There is no separate Parents CSV, deliberately. The only stable way for one to
name its children is the admission number, which the import *generates*, so it
would force a round trip: import students, read back their numbers, build a
second file. Parent columns on the student row match the spreadsheet a school
already keeps and need no round trip.

The rule that makes this work is the inverse of the student rule: an existing
**student** address is an error, while an existing **parent** address means
*reuse and link*. That is what puts two siblings under one parent account —
repeat the same `parentemail` on both rows. An address belonging to any other
role is refused outright: one account, one role, so a teacher's address cannot
quietly become a parent as well.

Names are only required for a parent that does not exist yet; linking to one
who does needs nothing but the address.

The link is written **both ways** — `parentProfile.children` and
`studentProfile.parentId` — because the portal reads the relationship from
both ends. The parent is resolved **after** the student is created, and a
failure there is reported against the row without undoing the student: a child
enrolled with no parent linked is a gap an admin can close on the Parents page,
whereas a child who failed to enrol because their mother's address was
malformed is not.

Only parents the import actually created are emailed a password. One that
already existed keeps the password they have — resending would be a password
change nobody asked for.

Passwords are generated per account; the CSV never carries one. An account
with an email is sent its password. A student without one gets a readable
password returned once in the commit response as `slips`, for printing (see
[Students with no email](#students-with-no-email)). Nothing stores the clear
text.

A student with no email has nothing unique to collide on, so a file run twice,
or a batch retried after it timed out, would enrol every child in it again. A
student whose first and last name are already in the same class is refused for
that reason, as is the same name twice in one class within the file. Rows are created **one at a time**,
because admission numbers and staff IDs come from a `pre('save')` hook that
`insertMany` would skip. A row that fails at creation time — someone took the
address between preview and commit — is reported without abandoning the rest.

Capped at 150 rows (`MAX_IMPORT_ROWS`) and 2 MB per file.

The client commits **20 rows at a time** and shows its progress. Each account
costs a bcrypt hash, so one request for a large file outlasted the timeout, and the
admin was told it had failed while the server kept creating accounts. If a batch
gets no answer the import stops there: those rows are reported as unconfirmed,
since they may have been created, and the rest as not attempted.

### Search — `/search` (2 routes)

| Method | Endpoint   | Returns                                          |
| ------ | ---------- | ------------------------------------------------ |
| GET    | `/?q=`     | Hits grouped by type, scoped to the caller's role |
| GET    | `/scopes`  | Which groups this role may search                 |

Groups: students, children, teachers, parents, classes, subjects, assignments,
tasks, announcements, books. Which of them a role may see is declared once in
`searchService.GROUP_ROLES` — a search result is a permission decision, and
leaving it to whichever page renders the hit is how a parent learns that
another family exists.

The scoping that matters: a Teacher sees only students in classes they are
responsible for; a Parent sees only their own children; a Student never sees an
unpublished assignment; announcements respect `targetAudience`. The query is
regex-escaped, so `.*` is text rather than a full-collection scan, and anything
under two characters returns nothing.

Each hit carries the URL that opens it, resolved for the caller's role. Groups
are queried in parallel with `Promise.allSettled`, so one failing collection
leaves the rest of the results standing.

UI: the topbar box on every dashboard (`Ctrl`/`⌘`+`K`), with arrow-key and
Enter navigation.

### Other domains

| Base                | Routes | Controller                  |
| ------------------- | ------ | --------------------------- |
| `/users`            | 12     | `userController`, `userImportController` |
| `/parents`          | 7      | `parentController`          |
| `/classes`          | 5      | `classController`           |
| `/subjects`         | 4      | `subjectController`         |
| `/attendance`       | 5      | `attendanceController`      |
| `/exams`            | 4      | `examController`            |
| `/assignments`      | 6      | `assignmentController`      |
| `/submissions`      | 5      | `submissionController`      |
| `/announcements`    | 4      | `announcementController`    |
| `/dashboard`        | 4      | `dashboardController`       |
| `/timetables`       | 10     | `timetableController`       |
| `/library`          | 14     | `libraryController`         |
| `/calendar`         | 11     | `calendarController`        |
| `/exam-schedules`   | 10     | `examScheduleController`    |
| `/ca-tracking`      | 6      | `caTrackingController`      |
| `/promotions`       | 8      | `promotionController`       |
| `/certificates`     | 9      | `certificateController`     |
| `/config`           | 1      | Public: the feature set and the school's name |
| `/webhooks`         | 2      | Paystack by HMAC, Flutterwave by shared hash; no JWT |

**180 routes total.**

### Attendance — `/attendance` (5 routes)

| Method | Endpoint                            | Who              | Does                             |
| ------ | ----------------------------------- | ---------------- | -------------------------------- |
| POST   | `/mark`                             | Admin, Teacher   | Bulk upsert, one record per student per day |
| GET    | `/my-classes`                       | Admin, Teacher   | Classes the caller may mark       |
| GET    | `/class/:classId?date=`             | Admin, Teacher   | The register: students + what is already marked |
| GET    | `/class/:classId/report?from=&to=`  | Admin, Teacher   | Per-student totals over a range    |
| GET    | `/student/:studentId/summary`       | Any (own data)   | One student's totals               |

Three rules the marking flow depends on:

- **The calendar decides the term, not the page.** `POST /mark` stamps `term`
  and `academicYear` from the active `AcademicCalendar` unless the client
  explicitly sends them (which is how an earlier term gets backfilled). The
  attendance page used to send hard-coded values, so every register in the
  system was filed under First Term 2024/2025.
- **A teacher marks only their own classes.** `utils/teacherScope` is the one
  definition of that — form teacher of the class, or class teacher of one of
  its sections — and it guards marking, reading and reporting alike. The page
  previously listed every class in the school.
- **Dates are flattened to midnight UTC** before they touch the collection, so
  the unique index on `{ student, date }` cannot be defeated by a timestamp.
  A future-dated register is refused, as is a student who is not in the class.

### Sorting lists

`GET /users`, `/parents`, `/classes`, `/subjects`, `/fees` and `/library/books`
accept `sort`: `az` (the default), `za`, `newest` or `oldest`. Names compare
case-insensitively with numbers in number order, so "Basic 2" comes before
"Basic 10". People sort by first name, then surname, as they are shown.

### Response shape

```jsonc
// success
{ "success": true, "message": "...", "data": { } }

// paginated
{ "success": true, "data": [], "meta": { "total": 0, "page": 1, "limit": 20, "pages": 0, "hasNext": false, "hasPrev": false } }

// error
{ "success": false, "message": "...", "errors": [{ "field": "email", "message": "..." }] }
```

---

## 10a. Audit log

Sensitive actions are recorded to an append-only `AuditLog` collection. The
question it exists to answer is *"who changed this score, and when"* — and its
financial equivalent. Without it, a disputed result or a missing payment is a
matter of opinion.

### What is recorded

| Action                                       | Captures                             |
| -------------------------------------------- | ------------------------------------ |
| `result.create` / `result.update`             | Score diff (from → to), subject, student |
| `result.bulk_upsert`                          | Class, subject, student count        |
| `result.publish`                              | Class, term, records published       |
| `payment.manual`                              | Amount, gateway, resulting balance   |
| `payment.settle`                              | Reference, amount, status, and whether the webhook or the redirect settled it. Recorded once |
| `fee.create`                                  | Fee total, class, term               |
| `user.create` / `user.delete`                 | Email, role, admission or staff number. Includes parents |
| `user.activate` / `user.deactivate`           | Role, whether sessions were revoked  |
| `auth.login`                                  | Success **and** failure, with reason |
| `auth.password_reset`, `auth.logout_all`      | Account, sessions ended              |
| `certificate.issue` / `certificate.revoke`    | Certificate number, and the reason for a revocation |
| `promotion.apply`                             | Promoted / repeated / graduated counts |
| `parent.link_child` / `parent.unlink_child`   | Parent and child. A link decides who can read a child's records |
| `attendance.mark`                             | Class, date, term, how many absent, created vs updated |
| `task.assign`                                 | Batch, assignees, due date, priority |
| `task.submit`                                 | Attempt number, whether it was late  |
| `task.approve` / `task.reject`                | Decision and the reason given        |
| `task.cancel` / `task.delete`                 | Task, assignee, status at the time   |
| `staff-attendance.clock-in` / `clock-out`     | Time, status, minutes late or worked |
| `staff-attendance.mark` / `update` / `delete` | Staff member, date, status change    |

Failed attempts are recorded as well as successful ones — a run of failed
logins is exactly the signal worth keeping.

### Design rules

- **An audit failure never fails the action.** A school cannot be blocked from
  publishing results because a log write failed. Errors are swallowed and
  logged.
- **Nothing sensitive is ever written.** Passwords, tokens, and gateway
  payloads are stripped at any depth before the entry is created. Long strings
  and arrays are summarised rather than copied.
- **Only diffs, never whole documents.** Copying records into the log would
  make it unreadable and would quietly duplicate personal data.
- **`subject`** links an entry to the student it concerns even when the entity
  is something else (a Payment, a Certificate). That is what makes
  "everything that happened to this child" a single query.

### Recording an action

```js
const audit = require('../services/auditService');

await audit.record(req, {
  action: 'result.update',
  entity: 'Result',
  entityId: result._id,
  entityLabel: 'Mathematics',
  subject: studentId,
  changes: audit.diff(before, after),
  meta: { term, academicYear },
});
```

## 11. Database schema

25 models in 21 files. The ones with non-obvious behaviour:

### User

```
firstName, lastName, email (unique; a placeholder for a student with none),
password (bcrypt, select:false), role,
phone, avatar{url,publicId}, isActive, lastLogin, passwordChangedAt
studentProfile: { admissionNumber (auto), class→Class, section, parentId→User,
                  dateOfBirth, gender, profileStatus,
                  enrolments[{ class→Class, academicYear }] }
teacherProfile: { staffId (auto), classTeacherOf→Class, subjectsTaught→[Subject] }
parentProfile:  { occupation, relationship, children→[User] }
```

Admission numbers and staff IDs are generated in a `pre('save')` hook from the
`Counter` collection.

`class` is where a student is now, and a graduate keeps their last one, so it is
neither history nor proof of enrolment. `enrolments` is the history: a promotion
writes the session being left when it is applied. `utils/enrolment.js` reads both.

`parentId` holds one parent and a child can have two, with each listing the child
in `parentProfile.children`. Anything sent to parents goes through
`parentsOfStudent()`.

### Result

```
student→User, class→Class, subject→Subject, term, academicYear,
scores{ca1,ca2,classWork,project,exam}, totalScore, grade, remark, gradePoint,
classAverage, classHighest, classLowest, position, isPublished, gradedBy
```

**Unique:** `{ student, subject, term, academicYear }`.
`pre('save')` computes totals and grades — but `bulkWrite` bypasses it, which
is why `scoreValidation.js` exists and why the bulk path computes fields
explicitly.

### Fees / Payment

```
Fees:    title, class→Class, term, academicYear, items[{label,amount,isCompulsory}],
         totalAmount (derived), dueDate, lateFee
Payment: student→User, feeStructure→Fees, amountPaid, amountDue,
         balance (derived), status (derived), gateway, transactionRef (unique),
         receiptNumber (unique), gatewayResponse (select:false), processedBy,
         instalments[{amount,receiptNumber,date,processedBy,notes}]
```

`Fees.totalAmount` is summed from `items` in **`pre('validate')`**, not
`pre('save')` — Mongoose validates before save hooks run, so a required field
computed in `pre('save')` can never be satisfied.

`Payment.balance` and `.status` are derived in `pre('save')` from `amountPaid`
vs `amountDue`.

**`amountDue` is what that record is answerable for, not what the fee costs.**
A gateway document owes the instalment it was raised for. The single
accumulating cash document owes the cash it has taken plus whatever of the fee
is still unpaid — charging it the whole fee would double-count anything already
settled online and pin it on `Partial` for good. Summed across a fee's records
the two still come to the fee total, which is what keeps the financial report's
`totalExpected` honest. For what a student actually owes, use
`getFeeBalances()`, never one record's `balance`.

### Session

```
user→User, tokenHash (sha256, unique), previousTokenHash (sha256, sparse),
rotatedAt, userAgent, ip, lastUsedAt, expiresAt
```

TTL index on `expiresAt`. `previousTokenHash` and `rotatedAt` are what
distinguish a refresh that raced a rotation from a token being replayed — see
[Refresh token rotation](#refresh-token-rotation).

### Sequence

Named atomic counters (`Sequence.next('receipt-25')`). Deliberately separate
from `Counter`, which numbers admissions — changing that model's query shape
would risk reissuing duplicate admission numbers. Certificate numbers use it too,
seeded with `Sequence.atLeast` so numbering carries on from what has been printed.

### Promotion

A batch runs `Draft → Processing → Completed`. `Completed` only means the
decisions are made; `appliedAt` means students have moved. It is claimed atomically,
so a batch applies once, and an applied batch can no longer be edited.

### Certificate

The PDF is stored in `pdfData` (`select: false`, stripped from JSON) and served
only by `GET /certificates/:id/download`, which checks ownership on every request.

### AuditLog

```
actor→User, actorName, actorRole (snapshot, so the log survives a rename),
action, entity, entityId, entityLabel, subject→User,
changes, meta, ip, userAgent, outcome, reason, createdAt
```

Append-only: `updatedAt` is disabled and nothing in the API can modify an
entry. Indexed on `{entity, entityId}`, `{actor}` and `{createdAt}` — the
three ways it actually gets read.

### Others

`Class`, `Subject`, `Attendance` (unique `{student, date}`), `Exam`,
`Assignment` / `Submission` (unique `{assignment, student}`), `Announcement`,
`AcademicCalendar`, `Timetable`, `Library` (Book + BorrowRecord), `CATracker`,
`Certificate`, `ExamSchedule`, `Promotion`, `Counter`, `Task` (one per
assignee, grouped by `batchId`), `StaffAttendance` (unique `{staff, date}`).

---

## 11b. Dashboards

Each role's dashboard is built from shared parts in
`client/src/components/dashboard/DashboardParts.jsx`: a row of shortcut tiles,
a noticeboard of announcements, a month calendar with what is coming up, stat
tiles, and charts. The shell around every page has a light sidebar, the school's
name in the topbar (from `SCHOOL_NAME`, served by `GET /config`), and an account
menu holding Change password and Sign out.

| Role | Shortcuts | Below the noticeboard and calendar |
| --- | --- | --- |
| Admin | Add Student, Add Teacher, New Fee Structure, Record Payment, Assign Task, New Announcement | Roster tiles; what needs attention; attendance today; fees this term; fee collection by method; recent payments; enrollments |
| Teacher | Mark Attendance, Enter Grades, Create Assignment, My Tasks, Clock In / Out, Exam Schedules | Class, assignment and grading tiles; assignments; today's register |
| Student | Results, Assignments, Payment, Timetable, Exam Schedules, Library | Score and attendance tiles; attendance this term; fees; due assignments; recent results |
| Parent | Payment, Results, Assignments, Timetables, Exam Schedules, Certificates | One card per child: score, attendance and fees |

Shortcut tiles are drawn from the Quick Actions list, so a feature the school
does not run drops out of both, and its fallback label is used in both.

Two figures come from the server for the dashboards specifically:

- `GET /dashboard/admin` returns `feeModes`: this term's money grouped by how
  it arrived. Abandoned checkouts carry no money and are left out.
- `GET /dashboard/parent` returns `feeBalance` per child: what this term's fee
  still owes, from `getFeeBalances()`. The Fees tile used to show the latest
  payment's status, so a part-payment read as "Paid".

Every other page uses the same visual language: `.card` and the table wrapper
take the 16px `--radius-lg` corner and a flat white header, so a page reads as
the dashboards do without per-page styles.

Doughnuts are used only for a whole split into a few parts (attendance, payment
methods), always with their values listed beside them. One amount against a
total (fees collected) is a progress meter.

## 11a. Printing

Report cards, timetables and login slips are printed from the browser with
`react-to-print` — no server-side PDF for any of them, and no extra dependency.

`LoginSlips` passes its own `pageStyle` (A4 portrait), because the timetable's
stylesheet sets landscape for every print.

`PrintableTimetable` renders **its own week grid** rather than printing the
interactive view. The on-screen `TimetableView` is built for a phone, one day
at a time with a day switcher; what gets pinned to a noticeboard is the whole
week at once. Columns are **period numbers, not clock times** — schools shift a
period's timing between days, and keying the grid on times yields a column per
variant.

The button lives inside `TimetableView`, so every dashboard that renders a
timetable gets it, and it always prints the timetable currently on screen — the
component owns the active-timetable index, so putting the button on each page
would mean the page guessing, and a parent printing the wrong child's week.

The grid is positioned off-screen rather than `display: none`: react-to-print
clones the node, and a node that was never laid out has no column widths to
clone, which prints as a collapsed table.

---

## 12. File storage

Multer memory storage → streamed to Cloudinary. Certificate PDFs are not here:
they hold a child's name and grades, so they live in MongoDB.

| Content       | Folder                | Max size |
| ------------- | --------------------- | -------- |
| Avatars       | `smp/avatars/`        | 5 MB     |
| Assignments   | `smp/assignments/`    | 10 MB    |
| Submissions   | `smp/submissions/`    | 10 MB    |
| Announcements | `smp/announcements/`  | 10 MB    |

Allowed: images (JPEG/PNG/GIF/WebP), PDF, DOC(X), XLS(X), PPT(X), TXT, ZIP.

Uploads record a `resourceType` (`image` | `video` | `raw`) alongside
`publicId`. Cloudinary's `destroy` needs it — passing `auto` silently fails and
orphans every non-image file.

`handleUploadErrors` turns multer's errors into readable 400s instead of 500s.

---

## 13. Notifications & the job queue

Email is sent **through a queue**, not inline. Agenda is backed by the same
MongoDB the app already uses — no extra infrastructure. Jobs live in the `jobs`
collection; failures are retried and left there for inspection.

```js
await enqueueEmail({ to, subject, html });
await enqueueBulkEmail(recipients, (r) => ({ to: r.email, subject, html }));
```

If the queue is unavailable, `enqueueEmail` sends inline instead. Degraded, but
a payment receipt is never silently dropped.

**Emails sent:** welcome (user + parent creation), password reset, payment
receipt (gateway and manual), results published, announcements, certificate
issued, certificate revoked. Results and certificate notices go to every parent
linked to the child.

Finished jobs are deleted (`removeOnComplete`), because a welcome email's body is
a plaintext password. Failed sends retry with backoff, then are removed.

**SMS** via Twilio is wired for announcements and skipped when unconfigured.

**Two ways to send.** With `RESEND_API_KEY` set, mail goes through Resend's
HTTP API over HTTPS and the `SMTP_*` settings are ignored. Use it on any host
that blocks outbound SMTP ports (25, 465, 587), as Render's free plan does: there
an SMTP send never reaches the provider and fails only after a timeout. Without
the key, mail goes over SMTP, which now times out after 10 seconds rather than
Nodemailer's default two minutes. The startup log says which is in use.

TLS certificate validation is **on**. Set `SMTP_ALLOW_SELF_SIGNED=true` only
for a local mail server with a self-signed certificate.

---

## 14. Environment variables

### Backend `.env`

```
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://...

JWT_SECRET=                  # min 32 random chars
JWT_EXPIRE=1h                # keep short — access tokens cannot be revoked
JWT_REFRESH_SECRET=          # different from JWT_SECRET
JWT_REFRESH_EXPIRE=30d

CLIENT_URL=https://yourschool.ng   # exact origin; comma-separate for several.
                                   # The only origins CORS allows in production

SCHOOL_NAME=Your School Name       # required for report cards and certificates
SCHOOL_ADDRESS=
SCHOOL_PHONE=
SCHOOL_EMAIL=

SEED_ADMIN_EMAIL=                  # for `pnpm seed`
SEED_ADMIN_PASSWORD=

RATE_LIMIT_WINDOW_MINUTES=15       # window for every limiter below
RATE_LIMIT_MAX=600                 # API calls per ACCOUNT per window
AUTH_RATE_LIMIT_MAX=10             # login attempts per ACCOUNT per window
AUTH_RATE_LIMIT_PER_HOST=200       # login attempts per IP, a loose ceiling

SCHOOL_PROFILE=full                # full | office-fees — see section 4a
FEATURE_ONLINE_PAYMENTS=           # optional per-feature override
FEATURE_STAFF_ATTENDANCE=

SCHOOL_DAY_START=08:00             # staff clock-in: school-local wall clock
SCHOOL_DAY_END=15:30
SCHOOL_LATE_GRACE_MINUTES=10       # arrivals inside this still count Present
SCHOOL_UTC_OFFSET_MINUTES=60       # WAT; decides the day a record belongs to

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

PAYSTACK_SECRET_KEY=sk_live_...    # also verifies webhook signatures
FLUTTERWAVE_SECRET_KEY=
FLUTTERWAVE_WEBHOOK_HASH=          # the secret hash set in Flutterwave's dashboard

RESEND_API_KEY=                    # send over HTTPS; SMTP_* is then ignored
SMTP_HOST=
SMTP_PORT=587                      # 465 switches to implicit TLS
SMTP_USER=
SMTP_PASS=
SMTP_ALLOW_SELF_SIGNED=false
FROM_EMAIL=noreply@yourschool.ng
FROM_NAME=Your School Name

TWILIO_ACCOUNT_SID=                # optional
TWILIO_AUTH_TOKEN=                 # optional
TWILIO_PHONE_NUMBER=               # optional

KEEP_ALIVE=true                    # on by default in production
PING_URL=https://api.yourschool.ng/keep-alive
                                   # this deployment's own address. Render's
                                   # RENDER_EXTERNAL_URL is used if unset; with
                                   # neither, nothing is pinged
```

### Client `.env.local`

```
VITE_API_URL=https://api.yourschool.ng/api/v1
```

---

## 15. Testing

```bash
cd backend
pnpm test              # 39 suites, 614 tests
pnpm test:coverage
```

| Suite                        | Covers                                                   |
| ---------------------------- | -------------------------------------------------------- |
| `unit/grading.test.js`       | Every grade boundary, competition ranking, weighted GPA  |
| `unit/validation.test.js`    | Score caps, request validators, error-handler status mapping |
| `integration/payments.test.js` | Settlement, idempotency, underpayment, receipt uniqueness |
| `integration/auth.test.js`   | Password hashing, token lifetimes, session revocation    |
| `integration/tasks.test.js`  | The approval workflow, and that one teacher cannot touch another's task |
| `integration/attendance.test.js` | Class scoping, calendar-stamped term, one record per student per day |
| `integration/search.test.js` | What each role may and may not find                       |
| `integration/splitPayments.test.js` | Part-payments across channels, the gateway floor, balance endpoints |
| `integration/financialReport.test.js` | Expected revenue from enrolment, abandoned attempts, the classId filter |
| `integration/refreshRotation.test.js` | Rotation, the two-tab race, replay detection, session expiry |
| `integration/userScope.test.js` | Which users and rosters a teacher may fetch               |
| `integration/rateLimitStore.test.js` | Counters shared across instances, window expiry, failing open |
| `integration/rateLimitIntegration.test.js` | The store driven through `express-rate-limit` itself |
| `integration/staffAttendance.test.js` | The clock, school time, one record per staff member per day |
| `integration/audit.test.js`  | What is recorded, and that nothing sensitive is           |
| `integration/reconcile.test.js` | Drift detection, and that `--apply` is idempotent      |
| `unit/cumulative.test.js`    | Folding terms into a cumulative, and the missing-term rule |
| `unit/adminOverview.test.js` | The overview's pulse, attention items and fee maths       |
| `unit/csv.test.js`           | Quoted fields, embedded newlines, CRLF, Excel's BOM       |
| `unit/env.test.js`           | What stops the server booting, and what only warns        |
| `unit/emailDelivery.test.js` | Resend API when its key is set, SMTP otherwise, and Resend's reason when it refuses |
| `unit/emailTemplates.test.js` | User text is escaped in every template                   |
| `unit/clientUrlAndLoginKey.test.js` | One link address; one login budget per account     |
| `integration/enrolment.test.js` | Fees across promotion, arrears, rosters, applying a batch once |
| `integration/scoreScope.test.js` | Who may enter and read scores, and for which class    |
| `integration/accountability.test.js` | Settlement audit, cash instalments, parent links, certificate numbers |
| `integration/userUpdate.test.js` | Editing a person changes only the form's fields: parent links, class history and children survive |
| `integration/listSort.test.js` | A to Z by default, number order, case, stable paging, the library's text search |
| `integration/classes.test.js` | Recreating a deleted class restores it; editing a section with no teacher |
| `integration/dashboardData.test.js` | A parent's fee status from the balance, payment methods, the school's name |
| `integration/studentAccess.test.js` | Who may read one student's records                 |
| `integration/hardening.test.js` | Locks, library, fee edits and certificate downloads    |
| `integration/features.test.js` | A disabled feature's routes really close                |
| `integration/userImport.test.js` | Bulk import, parents and siblings                      |
| `integration/importDocs.test.js` | `CSV_IMPORT.md` against the real validator           |
| `integration/jobQueue.test.js` | The inline fallback, and that the module is safe to require |

Integration tests run against a **real MongoDB in memory**
(`mongodb-memory-server`). Mocking Mongoose would defeat the purpose — the
bugs these tests exist to catch (a bypassed hook, an index not firing,
`bulkWrite` skipping validators) only appear against a real database. The only
mocked boundary is the payment gateway, stubbed at `fetch`.

---

## 16. Deployment

### Backend — Render / Railway / EC2

```
Install: pnpm install --frozen-lockfile
Start:   node server.js
```

### Client — Vercel

```
Build:   pnpm run build
Output:  dist
```

Set `VITE_API_URL` in the dashboard.

### Production checklist

- [ ] `NODE_ENV=production`
- [ ] `CLIENT_URL` set to the exact frontend origin. Nothing else is allowed by
      CORS in production
- [ ] `PING_URL` set to this deployment's own `/keep-alive`, unless on Render
- [ ] `SCHOOL_NAME` set, or report cards and certificates cannot be generated
- [ ] `JWT_EXPIRE=1h` (a leftover `30d` silently keeps long-lived tokens)
- [ ] JWT secrets ≥ 32 random characters, and different from each other
- [ ] Paystack webhook registered at `/webhooks/paystack`
- [ ] Paystack switched from test to live keys
- [ ] HTTPS everywhere; TLS terminated at the load balancer
- [ ] MongoDB URI with `?retryWrites=true&w=majority`
- [ ] Atlas IP allowlist includes the backend host
- [ ] Backup retention enabled (7 days minimum)
- [ ] `pnpm reconcile` run against production and its report read (see
      [Known gaps](#17-known-gaps)) before trusting any financial figure
- [ ] `pnpm migrate:enrolments` reviewed, then `:apply`, so students promoted
      earlier keep that year's fees
- [ ] Every subject has its classes assigned, or subject teachers cannot enter
      scores for it

Running more than one backend instance is supported: rate-limit counters are
shared through MongoDB, and sessions were already in the database. The one
thing that is still per-instance is the Agenda job queue's in-process
scheduler, which Agenda itself locks against double-running a job.

---

## 17. Known gaps

Recorded honestly so nobody rediscovers them the hard way.

- **No test coverage** for `pdfService`, the dashboard aggregations, the
  library, timetable, calendar, certificate or promotion domains, or any
  client code. The client still has no test runner at all.
- **The audit log UI has no automated test.** The page is smoke-checked to
  mount without throwing, but the client has no test runner, so the loaded
  state (filters, expanded rows) is unverified.
- **The audit log has no retention policy.** It grows without bound. That is
  the right default for an audit trail, but it will eventually want archiving.
- **`pdfService` uses async Promise executors.** Safe today (each wraps its
  body in try/catch and calls `reject`), but the lint rule is disabled at file
  scope until those three generators are restructured.
- **Historic payment data may still be wrong** until `pnpm reconcile:apply` has
  been run against production. Anything settled before the settlement fix is
  marked `Paid` with `balance: 0` regardless of what was collected. This is
  the one item on this list that code cannot close: it is an operational step
  against the live database. Run `pnpm reconcile` first — it is read-only —
  and read the report before applying anything.
- **Students promoted before enrolments existed** have no record of the class they
  left until `pnpm migrate:enrolments:apply` has been run. It works from results
  and registers, so a student with neither has nothing to recover.
- **Moving a student by editing their class writes no history.** That edit is as
  often a correction as a transfer, and recording a typo would bill two classes.
  A real mid-year transfer therefore drops the old class's fee from the ledger,
  unless money was paid towards it, in which case it stays on the student's own
  balance.
- **A new student can be billed for sessions before they joined.** With no history
  the current class speaks for later sessions, and the ledger does not compare
  against `admissionDate`, so a report over all years includes them. Filter by
  session.
- **A batch applied before `appliedAt` existed can be applied again.** It carries no
  flag to refuse on.
- **`Class.name` is unique on its own**, which makes the `{ name, academicYear }`
  index redundant: a class is one row for all time, and its `academicYear` is
  decorative. Changing it means an index migration on live data.
- **The redirect and the webhook can race.** Both can pass the already-settled
  check at the same moment. Neither double-counts money, because the amount is
  assigned rather than added, but the payer can get two receipt emails.
- **Payment receipts go to the student's address only**, not to parents.
- **A revoked certificate still appears in `GET /certificates`** for its student
  and parent, though it can no longer be downloaded.
- **Overpayments are reported, never corrected.** More collected than a fee is
  worth is usually a duplicate payment, and whether that becomes a refund or a
  credit against next term is a decision for a human.
- **The financial report's per-status and per-gateway breakdowns still count
  Payment documents**, not students. That is the right unit for "how did money
  arrive", but it means the counts beside `byStatus` are not comparable with
  `studentsOwing` in the same payload.

### Closed, and worth knowing why

These were on this list and are now fixed. Kept briefly so nobody
re-introduces them.

- **Debts vanishing on promotion, and graduates left on registers.** See
  `utils/enrolment.js`; covered by `integration/enrolment.test.js`.
- **Teachers entering scores for any class.** See `canEnterScores`; covered by
  `integration/scoreScope.test.js`.
- **Audit gaps** on webhook settlement, parent accounts, child links and certificate
  issue, and promotion entries with empty counts. Covered by
  `integration/accountability.test.js`.
- **Hard-coded deployment addresses** in CORS and the keep-alive.
- **`totalExpected` over-counting.** Now derived from fee structures and
  enrolment via `buildFeeLedger`, not summed from payment attempts. Covered by
  `integration/financialReport.test.js`.
- **The hardcoded report-card legend.** `gradeScale` and
  `summary.principalComment` now travel with the report-card payload; the
  client renders what it is given.
- **Refresh tokens not rotating.** They rotate, with a 60-second grace window
  for racing tabs and session revocation on replay.
- **`GET /users/:id` open to any Teacher.** Scoped to students in classes the
  teacher actually teaches; `GET /users/students/class/:classId` too.
- **In-process rate limiting.** Counters live in MongoDB and are shared across
  instances. The store fails open, so a database blip degrades the limit
  rather than locking everyone out.
