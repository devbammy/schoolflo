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
| Backfill class history (read-only) | `pnpm migrate:enrolments` |
| Write the class history | `pnpm migrate:enrolments:apply` |

From `client/`: `pnpm dev` (`:5173`), `pnpm build`, `pnpm lint`.

CI (`.github/workflows/ci.yml`) runs backend lint, format check and tests,
plus the client build, on every push and PR to `main`.

If `pnpm` is not on PATH in your shell, `npx jest` / `npx eslint` /
`npx prettier` / `npx vite build` work against the installed tree.

**On Windows the tests need the Microsoft Visual C++ Redistributable**
(`winget install --id Microsoft.VCRedist.2015+.x64 --exact`). Without it the
failure is misleading: Jest's native resolver cannot load, its WebAssembly
fallback cannot see Windows paths, and the message is `Module
<rootDir>/tests/setup/globalSetup.js in the globalSetup option was not found`
about a file that is plainly there. `mongod` needs the same runtime and exits
with code `3221225781`.

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
- **Each cash instalment is its own entry.** An office record accumulates, so
  `amountPaid` is a running total; `Payment.instalments` is what says who handed
  over how much, when, and on which receipt. Every instalment gets its own
  receipt number, and the list always adds up to `amountPaid`.

### Enrolment

`utils/enrolment.js` is the one definition. `studentProfile.class` says where a
student is **now**; `studentProfile.enrolments` says where they **were**.

| Question | Use |
| --- | --- |
| Who belongs on a roster? (register, batch, mailing) | `...ENROLLED_FILTER` |
| Does this fee apply to this student? | `isBilledFor(student, fee)` |
| Was this student in that class that session? | `inClassDuring(student, classId, year)` |

**Never read `studentProfile.class` to answer a question about the past**, and
never treat it as proof someone is still enrolled: a graduate keeps their last
class. Reading it for fees made a promoted child's debts vanish and billed them
for the new class's closed session. Reading it for a register kept graduates on
it for good.

A promotion batch writes the session being left when it is applied. Moving a
student by editing their class does not, on purpose: that edit is as often a
correction as a transfer. See [Known gaps](DOCUMENTATION.md#17-known-gaps).

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

### Student data ownership

`utils/studentAccess.js` is the one definition of "own data" for anything
filed against a student — results, attendance, certificates, CA tracking.

| Need | Use |
| --- | --- |
| Reading ONE student's records | `assertStudentAccess(user, studentId, subject)` (throws 403) |
| Filtering a LIST | `scopeQueryToStudents(query, user)` |

Staff are unrestricted; a student sees themselves; a parent sees their own
children. **`visibleStudentIds` returns `null` for staff (no restriction) and
`[]` for a parent with no children (see nothing)** — collapsing those two
would show a childless parent the whole school.

The rule used to be hand-written in `resultController` and copied into
`attendanceController`. The two domains that never copied it —
`certificateController` and `caTrackingController` — shipped with **no check
at all**: any signed-in account could list every certificate in the school, or
read any child's continuous assessment by changing the id in the URL. Both were
caught in review and both now go through this helper.

**A route with `protect` but no `authorize` is reachable by every role.** If
it returns anything belonging to a student, it needs one of the two calls above.

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

Scores have their own rule, `canEnterScores`: whoever owns the class may enter
any subject in it; anyone else must teach the subject **and** it must be offered
in that class (`Subject.classes`). A teacher can be assigned from either side,
`teacherProfile.subjectsTaught` or `Subject.teachers`, and nothing syncs them, so
read both. **A subject with no classes assigned accepts scores from nobody but
the class's owner and an admin.** A score must also belong under its class: the
student is in it, was in it that session, or the row is already filed there.

### Promotions

- **A batch applies once.** `appliedAt` is claimed atomically; a second attempt
  is a 409, and an applied batch can no longer be edited. Batches applied before
  this field existed carry no flag.
- Applying writes the session being left to each student's `enrolments` before
  moving them.
- Positions use the same competition ranking as report cards.

### Bulk account import

- **Two passes, never one.** `previewImport` says what it would do and writes
  nothing; `createUsers` does it. The admin approves in between.
- **The commit re-validates from scratch.** The preview's verdict is for the
  person reading it — the browser could send back anything, and an address free
  at preview time may be taken by the time they press the button.
- **One `User.create` per row, never `insertMany`.** Admission numbers and
  staff IDs come from a `pre('save')` hook, and `insertMany` skips save
  middleware — a bulk insert silently produces students with no admission
  number. Same family of trap as `bulkWrite` and the Result hooks.
- Passwords are generated server-side, emailed, and never stored or returned.
  The CSV never carries one.
- **The client commits in batches of 20.** Each account costs a bcrypt hash, so
  one request for a large file outlasted the timeout: the admin was told it had
  failed while the server carried on creating accounts. A batch that gets no
  answer is reported as unconfirmed, because it may have gone through.
- **A student row may name a parent.** An existing *student* email is an error;
  an existing *parent* email means reuse-and-link — that is what puts siblings
  under one account. An address belonging to any other role is refused: one
  account, one role.
- **The parent link is written both ways** — `parentProfile.children` and
  `studentProfile.parentId`. The portal reads the relationship from both ends,
  so writing one alone produces an account that works from one side only.
- The parent is attached **after** the student exists, and a failure there is
  reported without undoing the student. A child enrolled with no parent linked
  is a gap an admin can close on the Parents page; a child who failed to enrol
  because their mother's address was malformed is not.
- `utils/csv.js` is hand-written to avoid a dependency. It handles quoted
  fields, embedded commas and newlines, CRLF, and the UTF-8 BOM Excel prepends
  to every file it saves.
- **[CSV_IMPORT.md](CSV_IMPORT.md) is the admin-facing guide**, and
  `tests/integration/importDocs.test.js` runs its worked examples through the
  real validator and checks its column tables against `COLUMNS`. Rename a
  column and that suite fails until the doc is updated — which is the point,
  because a doc that lies sends a school off to fix a file that was never
  wrong.

### Audit log

- Append-only. No write/update/delete route exists, and none should.
- **An audit failure never fails the action.** Errors are swallowed and logged.
- Diffs only, never whole documents. Sensitive fields are stripped at any
  depth before an entry is created.
- `subject` links an entry to the student it concerns even when the entity is
  something else — that is what makes "everything that happened to this child"
  one query.
- **Record the event once, where it actually happens.** A gateway settlement is
  recorded by whichever of the webhook or the redirect settled it, never by the
  one that arrived second.

Record with:

```js
const audit = require('../services/auditService');
await audit.record(req, { action, entity, entityId, subject, changes: audit.diff(before, after), meta });
```

### Rate limiting

Counted **per account**, not per IP. A school NATs its whole staff room behind
one address, so IP keying gave thirty teachers one shared budget — measured on
a running server, the twelfth person to sign in on a Monday was refused.

| Limiter | Keyed on | Default | Env |
| --- | --- | --- | --- |
| API | user id (falls back to IP) | 600 / 15 min | `RATE_LIMIT_MAX` |
| Login | **the account being attempted** | 10 / 15 min | `AUTH_RATE_LIMIT_MAX` |
| Login, per host | IP | 200 / 15 min | `AUTH_RATE_LIMIT_PER_HOST` |

Brute force is an attack on one account, so that is what the login budget
protects — one teacher fumbling their password no longer locks out the school,
while the host ceiling still blunts someone walking a list of addresses.

The two auth limiters `skip` anything that is not a credential submission.
Applying them to the whole `/auth` router throttled `/auth/me` and
`/auth/refresh` too, and those carry no email to key on, so they fell back to
per-IP and put the school back on one small budget.

### Middleware order in `server.js` is load-bearing

`/webhooks` mounts **before** `express.json` (HMAC needs the raw body), and
the rate limiter is `/api`-only so a genuine payment notification is never
throttled. CORS is an exact-match allowlist — substring matching here is a
vulnerability.

---

## Responsive rules — easy to undo by accident

The portal is used on phones by parents and students, so a page that scrolls
sideways is a real failure: the button they need sits off the right edge.
Measured at 320 / 375 / 768px across all four roles, 34 page/width
combinations scrolled before this was fixed. Five rules keep it at zero.

1. **`.main-content` carries `min-width: 0`.** It is a flex item, and a flex
   item defaults to `min-width: auto` — "never shrink below my widest child".
   One wide table therefore stretched the whole page; at 320px the students
   list ran 541px over. This single property accounted for 27 of the 34.
   **No `overflow-x` on a descendant can fix that** — the ancestor has already
   grown.

2. **Grid tracks use `minmax(min(280px, 100%), 1fr)`**, never a bare
   `minmax(280px, 1fr)`. The `min(…, 100%)` lets a track collapse below its
   preferred width instead of forcing the container wide.

3. **Any flex row of controls needs `flex-wrap: wrap`.** Filter bars were the
   second biggest cause — `.controls-bar` and `.selection-bar__filters` ran to
   535px on a 320px screen.

4. **Never hide something with an inline `style={{ display: 'none' }}`.** An
   inline style cannot be overridden by a media query. The mobile menu button
   was hidden that way while the desktop one was hidden by `.hidden-mobile`,
   so on a phone there was **no way to open the navigation at all**. Use
   `.hidden-mobile` / `.only-mobile`.

5. **Form controls are 16px on phones.** Below that, iOS Safari zooms the page
   on focus and does not zoom back out. That is Safari's threshold, not a
   design choice — and note `.global-search__input` needs its own override,
   because a class selector beats the bare `input` rule on source order.

6. **`.btn` carries `flex-shrink: 0`, and so does an `svg` inside one.** A
   button is never the thing that should give way when a row runs out of room.
   The topbar menu button was squeezed to **0px wide** by the user's name
   sitting beside it — the button was still there, still focusable, still
   clickable, just invisible, which is a genuinely confusing way to fail.
   The name is `.hidden-mobile` now; the `flex-shrink` is what stops it
   happening again with something else.

   Note the symptom, because it misleads: the *icon* measured 0px wide while
   its computed `color` was correct, so it reads as a colour bug. It was a
   layout bug one level up.

7. **A flex item that holds text needs `min-width: 0` too**, not just the
   page column. `.global-search` lacked it, so on a phone the search box kept
   its full width and slid over the quick-actions button beside it.

8. **Figures never wrap.** A stat tile's number is `white-space: nowrap` and
   shrinks on phones instead: `₦22,0` over `00` reads as two numbers.

### Dashboards

The four dashboards share `components/dashboard/DashboardParts.jsx`. Two rules:

- **Shortcut tiles come from the Quick Actions list** (`useQuickActionItems`),
  picked by destination. Never write a second list of shortcuts: the modal's
  `feature` and `fallback` handling is what turns "Make a Payment" into
  "Fee Balance" at an office-fees school, and a copy would not.
- **Show real figures or nothing.** The reference design had income and expense
  charts; SchoolFlo records no expenses, so those panels show fee collection
  and payment methods instead. An empty state beats an invented number.

The school's name in the topbar comes from `SCHOOL_NAME` via `GET /config`, the
same value printed on report cards. On a phone it moves into the page heading.

A tab strip that will not fit **scrolls** (`overflow-x: auto` plus
`flex-shrink: 0` on the tabs) rather than wrapping — tabs on two lines under
one shared underline read as broken.

---

## Conventions

- **Comments explain *why*, and usually name the bug that made the code look
  the way it does.** This is the house style throughout, and it is load-bearing
  documentation — match it. A comment restating what the line does is noise; a
  comment saying "the attendance page used to send hard-coded values, so every
  register was filed under First Term 2024/2025" is the point.
- Line endings are mixed: source is mostly LF, and some files
  (`DOCUMENTATION.md` among them) are CRLF. Preserve what a file already has
  when scripting edits.
- **Never put a literal U+FEFF in source.** ESLint's `no-irregular-whitespace`
  rejects it; build it with `String.fromCharCode(0xfeff)` or `\uFEFF`.
- Prettier config is at the repo root and applies to both workspaces.
  Both workspaces lint with ESLint 8 and `.eslintrc.json`. CI caps warnings
  (60 backend, 130 client), so a new one can fail the build.
- Prettier's CI check covers `src/**/*.js`, `tests/**/*.js` and `server.js`
  only. Markdown is not checked and is not Prettier-clean; don't reformat it.
- Existing lint warnings (unused imports in a few controllers and services)
  are pre-existing. Don't let a new one in; fixing old ones is optional.

---

## Testing

`pnpm test` — 32 suites, 529 tests, Jest, `maxWorkers: 1`. The integration
suites need a MongoDB binary (`mongodb-memory-server` fetches it on first run)
and take from about three minutes to ten on a slow machine, mostly bcrypt at
cost 12. Tests that exercise failures log to the console by design, so judge a
run by its final summary, not by red text along the way.

The client now has ESLint too (`pnpm lint` from `client/`), and CI runs it.
The build alone never caught an undefined component — an undefined
`<BulkImportModal/>` shipped that way — nor a stray `/>`, which JSX treats as
*text* and renders on the page. Both are lint errors now.

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
   them.** Cheaper than letting a test send mail, and it keeps assertions
   about "was this queued" honest.

   `jobQueue` no longer poisons everything that imports it. Agenda used to be
   `require`d at module scope, and being ESM it threw `Cannot use import
   statement outside a module` under Jest — which spread to every module that
   imported it, and is why `buildFeeLedger` had to be split into its own
   dependency-free service. It is now loaded with `await import()` inside
   `startJobQueue`, so the ESM boundary is confined to that one function.

   Jest still cannot execute that import (`--experimental-vm-modules`), so
   **the running queue is proved end-to-end against real Node, not in Jest**.
   `tests/integration/jobQueue.test.js` covers the inline fallback and that
   the module is safe to require.

Client code has **no test runner**. The check is that it lints and builds.

---

## Where things live

| Looking for | Go to |
| --- | --- |
| Grade scale, score caps, roles, terms | `backend/src/config/constants.js` |
| What a student owes | `paymentService.getFeeBalances()` |
| What the school is owed | `feeLedgerService.buildFeeLedger()` |
| Settlement | `paymentService.settlePayment()` |
| Class stats, ranking, report cards | `services/gradingService.js` |
| Teacher scope, who may enter scores | `utils/teacherScope.js` |
| Who is enrolled, class in a past session | `utils/enrolment.js` |
| Every parent of a student | `utils/parentLookup.js` |
| School wall clock (staff attendance) | `utils/schoolTime.js` |
| Search scoping per role | `searchService.GROUP_ROLES` |
| CSV reading and writing | `utils/csv.js` |
| Import validation and creation | `services/userImportService.js` |
| Audit recording and redaction | `services/auditService.js` |
| Rate-limit store | `middleware/rateLimitStore.js` |
| What a rate limit counts | `middleware/rateLimitKeys.js` |
| Who may see a student's records | `utils/studentAccess.js` |
| Which features this school runs | `config/features.js` |
| Client's copy of the feature set | `client/src/store/featureStore.js` |
| Printable timetable grid | `client/src/components/common/PrintableTimetable.jsx` |
| Bulk import UI | `client/src/components/common/BulkImportModal.jsx` |
| Axios interceptors + auth bridge | `client/src/services/api.js` |
| Dashboard building blocks (tiles, noticeboard, calendar, charts) | `client/src/components/dashboard/DashboardParts.jsx` |
| Account menu (change password, sign out) | `client/src/components/layout/UserMenu.jsx` |
| Persisted auth state | `client/src/store/authStore.js` |

---

## Traps

- **Certificate PDFs live in MongoDB, never on a public URL.** They hold a
  child's name and grades. `Certificate.pdfData` is `select: false` and stripped
  from every JSON response; the only way to a document is
  `GET /certificates/:id/download`, which applies `assertStudentAccess` on every
  request and refuses a revoked certificate to everyone but an admin. Do not put
  a file link in an email or an API response. `pnpm migrate:certificates` moves
  any legacy Cloudinary-hosted ones (dry run first).
- **Email every parent, not `studentProfile.parentId`.** That field holds one
  parent and a child can have two. `parentsOfStudent()` reads both sides.
- **Nothing school-specific is built in.** In production CORS allows only
  `CLIENT_URL`, and the keep-alive pings only `PING_URL` or Render's
  `RENDER_EXTERNAL_URL`. A hard-coded address here becomes every school's.
- **Build links with `clientUrl()`, never `process.env.CLIENT_URL`.**
  `CLIENT_URL` may list several origins for CORS; interpolating it raw breaks
  every reset, welcome and payment-return link.
- **Email templates escape their arguments centrally** (`escapeDeep` in
  `notificationService.js`). A template added later is safe by construction;
  don't `${...}` user text into HTML anywhere else.
- **`calculateGrade` matches on `min` only.** The bands are whole numbers
  (60-69, 70-100), so testing `<= max` sent 69.5 to F. Keep it that way.
- **Email addresses are normalised the same way in two places** —
  `NORMALIZE_EMAIL_OPTIONS` (validators) and `byLoginTarget` (rate limiter).
  Change one and the login rate limit gets a per-spelling budget again.
- **The server refuses to boot on a bad environment** (`config/env.js`).
  `.env.example` lists every variable. In production a JWT secret under 32
  characters, or two identical ones, is fatal.
- **Published results are locked to teachers**; an admin correction recomputes
  class statistics. A user with records cannot be deleted (deactivate), and the
  last active admin cannot be deactivated or deleted.
- **The email queue deletes jobs when done** (`removeOnComplete`) because a
  welcome email's body is a plaintext password. It retries with backoff; do not
  add anything to a job that must not sit in the database.
- **`scheduledAt` on announcements is not supported** — nothing publishes on a
  schedule. The field and the admin overview's alert on it are kept for the day
  a scheduler exists.

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

## Outstanding operational tasks

**`pnpm migrate:enrolments:apply` has not been run against production.** Until it
has, a student promoted before enrolments existed has no record of the class they
left, so that year's fees do not reach their balance or the ledger. Run the
read-only `pnpm migrate:enrolments` first. It only adds entries.

**`pnpm reconcile:apply` has not been run against production.** Payments
settled before the settlement fix are marked `Paid` with `balance: 0`
regardless of what was actually collected. Until it is run, historic financial
data is unreliable — and no code change can close this, because it is a
correction to live data. Run `pnpm reconcile` first (read-only) and read the
report before applying anything. `amountPaid` is never rewritten; the money
that came in is the one fact that is trusted.

See [DOCUMENTATION.md §17](DOCUMENTATION.md#17-known-gaps) for the rest of the
known gaps, and [features.md](features.md) for the roadmap.
