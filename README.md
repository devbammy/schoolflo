# School Management Portal (SMP)

A production-grade SaaS platform digitizing academic, administrative, and financial
processes for Nigerian secondary schools.

## Quick Start

```bash
# Backend
cd backend && cp .env.example .env && npm install && npm run dev

# Frontend (new terminal)
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

See **DOCUMENTATION.md** for full technical reference.

## Stack
- **Backend**: Node.js · Express · MongoDB/Mongoose · JWT
- **Frontend**: React 18 · Vite · Zustand · SCSS
- **Payments**: Paystack · Flutterwave
- **Storage**: Cloudinary (AWS S3 compatible)
- **Email/SMS**: Nodemailer (SMTP) · Twilio

## Roles
| Role    | Dashboard Capabilities |
|---------|------------------------|
| Admin   | Full system control, financial reports, user management |
| Teacher | Class attendance, grade entry, assignment management |
| Student | View results, submit assignments, pay fees |
| Parent  | Monitor children's performance and fee status |
