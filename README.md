# SchoolFlo

A school management portal for Nigerian secondary schools — academic records,
attendance, fees, assignments, library, timetables and reporting, across four
roles.

## Quick start

This repo uses **pnpm**. Using npm against it will fail with an opaque error —
see [Working on this repo](DOCUMENTATION.md#working-on-this-repo).

```bash
# Backend
cd backend && cp .env.example .env && pnpm install && pnpm dev

# Client (new terminal)
cd client && pnpm install && pnpm dev
```

See **[DOCUMENTATION.md](DOCUMENTATION.md)** for the full technical reference.

## Stack

- **Backend** — Node.js · Express · MongoDB/Mongoose · JWT · Agenda
- **Client** — React 18 · Vite · Zustand · SCSS
- **Payments** — Paystack · Flutterwave
- **Storage** — Cloudinary
- **Email/SMS** — Nodemailer (SMTP) · Twilio

## Roles

| Role    | Capabilities                                                        |
| ------- | ------------------------------------------------------------------- |
| Admin   | Full system control, financial reports, user management             |
| Teacher | Attendance, grade entry for their own subjects, assignments         |
| Student | Results, assignments, fee payment, timetable, library               |
| Parent  | Monitor their children's performance, attendance and fees           |

## Commands

Run from `backend/`:

| Command              | Purpose                          |
| -------------------- | -------------------------------- |
| `pnpm dev`           | Start with nodemon               |
| `pnpm test`          | Run the test suite               |
| `pnpm test:coverage` | Tests with a coverage report     |
| `pnpm lint`          | ESLint                           |
| `pnpm format`        | Prettier                         |
| `pnpm seed`          | Seed the first admin account     |
| `pnpm reconcile`     | Audit payment records (read-only)|

CI runs lint, format check, tests and the client build on every push and pull
request to `main`.
