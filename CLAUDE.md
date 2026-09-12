# CLAUDE.md

Orientation for working in this repo. For the full technical reference read
[DOCUMENTATION.md](DOCUMENTATION.md); this file is what you need in your head
before you touch anything.

---

## What this is

**SchoolFlo** — a school management portal for Nigerian secondary schools.
Academic records, attendance, fees, assignments, library, timetables,
certificates and reporting, across four roles (Admin, Teacher, Student,
Parent).

Two workspaces in one repo, deployed separately:

| | Stack | Deployed to |
| --- | --- | --- |
| `backend/` | Node · Express · MongoDB/Mongoose · JWT · Agenda | Render / Railway / EC2 |
| `client/` | React 18 · Vite · Zustand · SCSS | Vercel |

External services: Paystack + Flutterwave (payments), Cloudinary (files),
Nodemailer/SMTP (email), Twilio (SMS, optional).

The directory is `client/`, **not** `frontend/`.

---

## Commands

**Use pnpm, never npm.** `node_modules` is pnpm-managed; `npm install` fails
with `Cannot read properties of null (reading 'matches')` and can leave the
tree inconsistent.

From `backend/`:

| Task | Command |
| --- | --- |
| Dev server (`:5000`) | `pnpm dev` |
| Tests | `pnpm test` |
| Coverage | `pnpm test:coverage` |
| Lint | `pnpm lint` |
| Format | `pnpm format` |
| Format check (CI runs this) | `pnpm format:check` |
| Seed the first admin | `pnpm seed` |
| Audit payments (read-only) | `pnpm reconcile` |
| Repair payments | `pnpm reconcile:apply` |

From `client/`: `pnpm dev` (`:5173`), `pnpm build`.

CI (`.github/workflows/ci.yml`) runs backend lint, format check and tests,
plus the client build, on every push and PR to `main`.

If `pnpm` is not on PATH in your shell, `npx jest` / `npx eslint` /
`npx prettier` / `npx vite build` work against the installed tree.

---

## One codebase, many schools

SchoolFlo is deployed once per school, and a school is a **configuration,
never a branch**. Deleting features on a branch makes every future upstream
change a merge conflict, and the branch that is painful to merge is the one
that stops getting security patches.

`src/config/features.js` is the single source. Everything defaults to on, so
a deployment that sets nothing is the full product.

```
SCHOOL_PROFILE=office-fees      # named profile: full | office-fees
FEATURE_STAFF_ATTENDANCE=true   # per-feature override wins over the profile
```

Two enforcement mechanisms, and the choice is not stylistic:

| Shape of feature | How |
| --- | --- |
| A whole domain (staff attendance) | Don't mount its router in `server.js` |
| A feature inside a router the school still needs (payment gateways) | `requireFeature('name')` on those routes |

`requireFeature` returns **404, not 403**, and goes **before `protect`** — a
disabled feature must be indistinguishable from a route that was never
mounted.

**"Remove payments" is a trap.** A school collecting fees at the office still
needs fee structures, manual payments, balances, receipts and the financial
report. Only the gateway goes. Read the table in
[DOCUMENTATION.md §4a](DOCUMENTATION.md#4a-school-profiles-and-feature-flags)
before touching this.

The client reads the flags from `GET /api/v1/config` into
`store/featureStore.js`. Do not add a `VITE_FEATURES` build constant — that
is a second copy of a truth in a second deployable, and it will drift. Nav
entries and quick actions opt in with a `feature:` tag; a quick action can
declare a `fallback` label instead of vanishing. Hiding a nav item is
cosmetic; the server guard is the control.

---

## Layering — the rule that everything else follows

```
route → validator → controller → service → model
```

| Layer | Job |
| --- | --- |
| Route | Path, verb, middleware chain. No logic. |
| Validator | Shape and range of the request. Rejects bad input before a controller sees it. |
| Controller | Authorization, orchestration, response shape. |
| Service | Reusable domain logic and **all** external I/O. |
| Model | Schema, indexes, invariants enforced in hooks. |

**Controllers never use try/catch.** `express-async-errors` forwards throws to
the global handler. Throw `AppError.badRequest/unauthorized/forbidden/notFound/conflict`
for expected failures; anything else becomes a generic 500 with the detail
logged server-side only. Never leak `err.message` for an unexpected fault.

Response shape is fixed — `sendSuccess`, `sendError`, `sendPaginated` in
`utils/apiResponse.js`. Don't hand-roll a response body.

---

## Invariants — break these and you cause a real-world problem

### Payments

- **`settlePayment()` is the single settlement path.** Both the webhook and
  the browser redirect go through it.
- **Never `findOneAndUpdate` a Payment.** It bypasses the `pre('save')` hook
  that derives `balance` and `status`. Hardcoding `status: 'Paid'` is how an
  underpayment used to clear a full debt.
- **The client never defines what is owed.** `resolvePayableAmount()` is the
  only authority on what may be paid right now.
- **No single Payment document answers "is this fee paid?"** A ₦20,000
  instalment against a ₦45,000 fee is itself `Paid`. Use `getFeeBalances()`.
- **What the *school* is owed is `buildFeeLedger()`** in
  `services/feeLedgerService.js` — fee structures × enrolment, never summed
  from payment attempts. Both the financial report and the admin overview read
  it, so they cannot disagree.

### Grading

- `GRADE_SCALE` and `SCORE_BREAKDOWN` in `config/constants.js` are the single
  sources of truth. `calculateGrade`, the PDF legend and the API response all
  derive from them. **Do not write a second ladder anywhere**, especially not
  in the client — the report-card endpoint sends `gradeScale` and
  `summary.principalComment` precisely so the client never has to.
- `bulkWrite` bypasses `pre('save')`, which is why `utils/scoreValidation.js`
  exists and why the bulk path computes fields explicitly.
- Positions use competition ranking; averages are rounded to 2dp *before*
  ranking so float noise reads as the tie it is.

### Auth & sessions

- Access tokens are not revocable — the short lifetime is the whole defence.
- Refresh tokens **rotate on every use** and are returned alongside the access
  token. A client that keeps the old one gets signed out. A retired token
  presented within `Session.ROTATION_GRACE_MS` (60s) is a racing tab and is
  served; after that it is a replay and the session is deleted.
- Refresh tokens need their random `jti`. Without it, two tokens minted for
  one user in the same second are byte-identical and collide on
  `Session.tokenHash`.

### Teacher scoping

`utils/teacherScope.js` is the one definition, and it has two widths:

| Question | Use |
| --- | --- |
| May they **act on** this class? (mark a register, run its report) | `getTeacherClassIds` / `assertClassAccess` |
| May they **see the students of** this class? (load a roster to grade) | `getTeacherRosterClassIds` / `assertRosterAccess` |

The second is wider — it includes classes a subject they teach is offered in.
Using the narrow one for a roster breaks grade entry for every teacher who is
not also a form teacher. Using the wide one for a register hands the register
to someone who teaches one period a week.

### Audit log

- Append-only. No write/update/delete route exists, and none should.
- **An audit failure never fails the action.** Errors are swallowed and logged.
- Diffs only, never whole documents. Sensitive fields are stripped at any
  depth before an entry is created.
- `subject` links an entry to the student it concerns even when the entity is
  something else — that is what makes "everything that happened to this child"
  one query.

Record with:

```js
const audit = require('../services/auditService');
await audit.record(req, { action, entity, entityId, subject, changes: audit.diff(before, after), meta });
```

### Middleware order in `server.js` is load-bearing

`/webhooks` mounts **before** `express.json` (HMAC needs the raw body), and
the rate limiter is `/api`-only so a genuine payment notification is never
throttled. CORS is an exact-match allowlist — substring matching here is a
vulnerability.

---

## Conventions

- **Comments explain *why*, and usually name the bug that made the code look
  the way it does.** This is the house style throughout, and it is load-bearing
  documentation — match it. A comment restating what the line does is noise; a
  comment saying "the attendance page used to send hard-coded values, so every
  register was filed under First Term 2024/2025" is the point.
- Files use **CRLF** line endings. Preserve them when scripting edits.
- Prettier config is at the repo root and applies to both workspaces.
  Backend lint is ESLint 8 with `.eslintrc.json`; **the client has no lint
  config at all** — its check is `vite build`.
- Prettier's CI check covers `src/**/*.js`, `tests/**/*.js` and `server.js`
  only. Markdown is not checked and is not Prettier-clean; don't reformat it.
- Existing lint warnings (unused imports in a few controllers and services)
  are pre-existing. Don't let a new one in; fixing old ones is optional.

---

## Testing

`pnpm test` — 19 suites, 333 tests, Jest, `maxWorkers: 1`.

Integration tests run against a **real MongoDB in memory**
(`mongodb-memory-server`), started once in `globalSetup` with a database per
suite. Mocking Mongoose would defeat the purpose: the bugs these tests catch
(a bypassed hook, an index not firing, `bulkWrite` skipping validators) only
appear against a real database. The only mocked boundary is the payment
gateway, stubbed at `fetch`.

Two patterns to follow:

1. **Tests mount controllers on a small express app**, not on `server.js`:

   ```js
   const app = express();
   app.use(express.json());
   app.use((req, res, next) => { req.user = actingUser; next(); });
   app.get('/users/:id', getUserById);
   app.use(errorHandler);
   ```

2. **Mock `jobQueue` and `notificationService` in any suite that reaches
   them.** `jobQueue` requires `agenda`, which is ESM and blows up under Jest
   with `Cannot use import statement outside a module`. This is a real
   constraint on architecture, not just on tests: importing `paymentService`
   into a module that unit tests load will drag Agenda in with it. That is why
   `buildFeeLedger` lives in its own dependency-free `feeLedgerService`.

Client code has **no test runner**. The check is that it builds.

---

## Where things live

| Looking for | Go to |
| --- | --- |
| Grade scale, score caps, roles, terms | `backend/src/config/constants.js` |
| What a student owes | `paymentService.getFeeBalances()` |
| What the school is owed | `feeLedgerService.buildFeeLedger()` |
| Settlement | `paymentService.settlePayment()` |
| Class stats, ranking, report cards | `services/gradingService.js` |
| Teacher scope | `utils/teacherScope.js` |
| School wall clock (staff attendance) | `utils/schoolTime.js` |
| Search scoping per role | `searchService.GROUP_ROLES` |
| Audit recording and redaction | `services/auditService.js` |
| Rate-limit store | `middleware/rateLimitStore.js` |
| Which features this school runs | `config/features.js` |
| Client's copy of the feature set | `client/src/store/featureStore.js` |
| Axios interceptors + auth bridge | `client/src/services/api.js` |
| Persisted auth state | `client/src/store/authStore.js` |

---

## Traps

- **`Fees.totalAmount` is derived in `pre('validate')`, not `pre('save')`.**
  Mongoose validates before save hooks, so a required field computed in
  `pre('save')` can never be satisfied.
- **`findByIdAndUpdate` does not apply schema defaults.** Students created
  through an update can be missing `studentProfile.profileStatus` entirely, so
  queries that filter on it must accept `null` too.
- **Cloudinary's `destroy` needs the stored `resourceType`.** Passing `auto`
  fails silently and orphans every non-image file.
- **Attendance dates are flattened to midnight UTC** so the unique
  `{student, date}` index cannot be defeated by a timestamp. Staff-attendance
  `date` is a day *key*, not an instant.
- **The academic calendar decides the term**, not the page. `POST
  /attendance/mark` stamps `term` and `academicYear` from the active calendar
  unless the client explicitly overrides them.
- **`git` may refuse to run here** with "dubious ownership" (the repo is owned
  by a different Windows SID). Fix:
  `git config --global --add safe.directory D:/web/schoolflo`.

---

## Outstanding operational task

**`pnpm reconcile:apply` has not been run against production.** Payments
settled before the settlement fix are marked `Paid` with `balance: 0`
regardless of what was actually collected. Until it is run, historic financial
data is unreliable — and no code change can close this, because it is a
correction to live data. Run `pnpm reconcile` first (read-only) and read the
report before applying anything. `amountPaid` is never rewritten; the money
that came in is the one fact that is trusted.

See [DOCUMENTATION.md §17](DOCUMENTATION.md#17-known-gaps) for the rest of the
known gaps, and [features.md](features.md) for the roadmap.
