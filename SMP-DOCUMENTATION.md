# School Management Portal (SMP) — Technical Documentation
**Version:** 1.0.0 | **Stack:** Node.js + Express + MongoDB + React (Vite) + Zustand

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Project Structure](#2-project-structure)
3. [Getting Started](#3-getting-started)
4. [Grading Logic](#4-grading-logic)
5. [API Reference — /auth](#5-api-auth)
6. [API Reference — /results](#6-api-results)
7. [API Reference — /payments](#7-api-payments)
8. [Role-Based Access Control](#8-rbac)
9. [Database Schema Summary](#9-database-schema)
10. [Payment Gateway Integration](#10-payment-gateways)
11. [File Storage (Cloudinary)](#11-file-storage)
12. [Notification Channels](#12-notifications)
13. [Environment Variables](#13-environment-variables)
14. [Deployment Guide](#14-deployment)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                  React Frontend (Vite)               │
│  Zustand State │ React Router │ TanStack Query       │
│  Role Dashboards: Admin │ Teacher │ Student │ Parent │
└─────────────────────┬───────────────────────────────┘
                      │ HTTPS / REST (JWT Bearer)
┌─────────────────────▼───────────────────────────────┐
│              Node.js + Express API (v1)              │
│  Helmet │ CORS │ Rate Limiter │ Morgan               │
│  MVC: Controllers ▸ Services ▸ Models                │
└────────┬──────────────────────────────┬─────────────┘
         │ Mongoose ODM                 │ External APIs
┌────────▼────────┐         ┌───────────▼──────────────┐
│   MongoDB Atlas  │         │  Cloudinary (files)       │
│   (Primary DB)   │         │  Paystack / Flutterwave   │
└─────────────────┘         │  Nodemailer (SMTP email)  │
                             │  Twilio (SMS)             │
                             └──────────────────────────┘
```

### Design Principles
- **Modularity First**: Each domain (Academic, Finance, LMS, Comms) is encapsulated in its own controller + service layer — ready for microservices extraction.
- **RBAC on every route**: Admin → Teacher → Student → Parent with ownership checks.
- **Optimistic DB writes**: Bulk operations use `bulkWrite` for performance.
- **<2s responses**: MongoDB indexes on all frequent query patterns; aggregation pipelines replace N+1 queries.

---

## 2. Project Structure

```
smp/
├── backend/
│   ├── server.js                    # Express entrypoint
│   └── src/
│       ├── config/
│       │   ├── db.js                # MongoDB connection
│       │   └── constants.js         # Enums, grade scale, score caps
│       ├── models/
│       │   ├── User.js              # Auth + Student/Teacher/Parent profiles
│       │   ├── Class.js             # Class + sections
│       │   ├── Subject.js
│       │   ├── Attendance.js        # Daily records + static aggregator
│       │   ├── Exam.js              # Exam sessions + Result (pre-save auto-grade)
│       │   ├── Fees.js              # Fee structures + Payment transactions
│       │   ├── Assignment.js        # Assignments + Submissions
│       │   └── Announcement.js      # Multi-channel messaging
│       ├── controllers/
│       │   ├── authController.js
│       │   ├── resultController.js  # Grading engine + report cards
│       │   ├── paymentController.js # Paystack + Flutterwave + manual
│       │   └── dashboardController.js
│       ├── services/
│       │   ├── gradingService.js    # Class stats, positions, GPA
│       │   ├── paymentService.js    # Gateway wrappers + receipt gen
│       │   ├── notificationService.js # Email + SMS + templates
│       │   └── fileService.js       # Multer + Cloudinary
│       ├── middleware/
│       │   ├── auth.js              # JWT protect()
│       │   ├── rbac.js              # authorize() + ownDataOnly()
│       │   └── errorHandler.js      # Global error formatter
│       ├── routes/                  # One file per domain
│       └── utils/
│           └── apiResponse.js       # sendSuccess / sendError / sendPaginated
└── frontend/
    ├── src/
    │   ├── store/authStore.js       # Zustand persisted auth state
    │   ├── services/api.js          # Axios + all service modules
    │   ├── styles/main.scss         # Complete design system (CSS vars)
    │   ├── components/
    │   │   └── layout/DashboardLayout.jsx  # Sidebar + topbar
    │   └── pages/
    │       ├── auth/                # Login, ForgotPassword, ResetPassword
    │       ├── admin/               # Dashboard, Students, Teachers, ...
    │       ├── teacher/             # Dashboard, Attendance, Grades, ...
    │       ├── student/             # Dashboard, Results, Assignments, Payments
    │       └── parent/              # Dashboard, Results
    ├── vite.config.js
    └── index.html
```

---

## 3. Getting Started

### Prerequisites
- Node.js v18+
- MongoDB Atlas cluster (or local MongoDB 6+)
- Cloudinary account
- Paystack/Flutterwave account (Nigerian payment gateways)

### Backend Setup
```bash
cd smp/backend
cp .env.example .env          # Fill in all env vars
npm install
npm run dev                    # Starts on :5000
```

### Frontend Setup
```bash
cd smp/frontend
cp .env.example .env.local     # VITE_API_URL=http://localhost:5000/api/v1
npm install
npm run dev                    # Starts on :5173
```

### First Admin Account
Since registration requires an existing Admin, seed the first admin directly:
```bash
# Connect to MongoDB shell or Compass and insert:
db.users.insertOne({
  firstName: "Super",
  lastName: "Admin",
  email: "admin@school.edu.ng",
  password: "$2a$12$...",  # bcrypt hash of your password
  role: "Admin",
  isActive: true
})
```
Or use the included seeder:
```bash
npm run seed
```

---

## 4. Grading Logic

### Score Breakdown (100-point system)
| Component     | Max Marks | Weight |
|---------------|-----------|--------|
| CA1           | 10        | 10%    |
| CA2           | 10        | 10%    |
| Mid-Term Test | 10        | 10%    |
| Final Exam    | 70        | 70%    |
| **Total**     | **100**   | 100%   |

### Nigerian Grading Scale
| Score Range | Grade | Remark       | Grade Point |
|-------------|-------|--------------|-------------|
| 70 – 100    | A     | Distinction  | 5.0         |
| 60 – 69     | B     | Credit       | 4.0         |
| 50 – 59     | C     | Merit        | 3.0         |
| 45 – 49     | D     | Pass         | 2.0         |
| 40 – 44     | E     | Weak Pass    | 1.0         |
| 0  – 39     | F     | Fail         | 0.0         |

### Auto-Calculation (Mongoose Pre-Save Hook)
When a `Result` document is saved, the `pre('save')` hook fires:
```
totalScore = ca1 + ca2 + midTerm + exam
grade + remark + gradePoint = calculateGrade(totalScore)
```

### Publishing Flow
```
1. Teacher enters scores → POST /api/v1/results/bulk
2. Admin triggers publish → POST /api/v1/results/publish
   ├── computeClassStatistics() runs per-subject aggregate
   │   ├── Groups all results by subject
   │   ├── Computes: classAverage, classHighest, classLowest
   │   └── Assigns per-subject position (rank desc by score)
   ├── isPublished = true on all results
   └── Email notifications → parents of all students
3. Students & Parents can view report cards
```

### GPA Calculation
```
GPA = Σ(gradePoint × creditUnit) / Σ(creditUnit)
```
(Defaults to creditUnit = 1 for all subjects unless overridden.)

### Principal's Comment Logic
| Average Score | Comment                                              |
|---------------|------------------------------------------------------|
| ≥ 70          | Excellent performance. Keep up the outstanding work! |
| ≥ 60          | Very good performance. You are doing well.           |
| ≥ 50          | Good performance. Work harder for better results.    |
| ≥ 40          | Fair performance. Significant improvement is needed. |
| < 40          | Poor performance. Urgent attention required.         |

---

## 5. API — /auth

Base: `POST|GET /api/v1/auth`

| Method | Endpoint                        | Auth    | Body / Params                          | Response                             |
|--------|---------------------------------|---------|----------------------------------------|--------------------------------------|
| POST   | `/login`                        | Public  | `{ email, password }`                  | `{ user, accessToken, refreshToken }` |
| POST   | `/register`                     | Admin   | `{ firstName, lastName, email, password, role, ... }` | `{ user, accessToken }` |
| GET    | `/me`                           | Any     | —                                      | `{ user }` (populated)               |
| PUT    | `/update-password`              | Any     | `{ currentPassword, newPassword }`     | `{ accessToken }`                    |
| POST   | `/forgot-password`              | Public  | `{ email }`                            | 200 OK                               |
| PUT    | `/reset-password/:token`        | Public  | `{ password }`                         | `{ accessToken }`                    |
| POST   | `/refresh`                      | Public  | `{ refreshToken }`                     | `{ accessToken }`                    |

**JWT Token Lifecycle:**
- Access token: 30 days (configurable via `JWT_EXPIRE`)
- Refresh token: 90 days (configurable via `JWT_REFRESH_EXPIRE`)
- Frontend Axios interceptor auto-refreshes on 401

**Error Codes:**
| Code | Meaning |
|------|---------|
| 400  | Missing fields / email already registered |
| 401  | Wrong credentials / expired token |
| 403  | Deactivated account |
| 429  | Rate limit exceeded (20 login attempts / 15 min) |

---

## 6. API — /results

Base: `/api/v1/results` | Auth: All routes require Bearer token

| Method | Endpoint                              | Roles               | Description                               |
|--------|---------------------------------------|---------------------|-------------------------------------------|
| POST   | `/`                                   | Admin, Teacher      | Upsert single result                      |
| POST   | `/bulk`                               | Admin, Teacher      | Bulk upsert results array                 |
| POST   | `/publish`                            | Admin               | Compute stats → publish → email parents   |
| GET    | `/report-card/:studentId`             | All (own/child)     | Full term report card                     |
| GET    | `/class/:classId`                     | Admin, Teacher      | All results for a class/term/subject      |
| GET    | `/student/:studentId/history`         | All (own/child)     | All-term result history                   |

### POST /results (single upsert)
```json
{
  "student": "objectId",
  "class": "objectId",
  "subject": "objectId",
  "term": "First Term",
  "academicYear": "2024/2025",
  "scores": { "ca1": 8, "ca2": 7, "midTerm": 9, "exam": 58 },
  "teacherComment": "Good improvement this term"
}
```
Response: `{ result: { totalScore: 82, grade: "A", remark: "Distinction", gradePoint: 5.0 } }`

### POST /results/bulk
```json
{
  "class": "objectId",
  "subject": "objectId",
  "term": "First Term",
  "academicYear": "2024/2025",
  "results": [
    { "student": "id1", "scores": { "ca1": 9, "ca2": 8, "midTerm": 8, "exam": 55 } },
    { "student": "id2", "scores": { "ca1": 6, "ca2": 5, "midTerm": 7, "exam": 40 } }
  ]
}
```

### GET /results/report-card/:studentId
Query params: `?term=First Term&academicYear=2024/2025`

Response:
```json
{
  "student": { "firstName": "...", "studentProfile": { "class": {...} } },
  "results": [
    {
      "subject": { "name": "Mathematics", "code": "MTH" },
      "scores": { "ca1": 9, "ca2": 8, "midTerm": 8, "exam": 58 },
      "totalScore": 83, "grade": "A", "remark": "Distinction",
      "position": 2, "classAverage": 67.4, "classHighest": 89, "classLowest": 28
    }
  ],
  "summary": {
    "totalSubjects": 8, "average": 74.6, "gpa": 4.5,
    "overallPosition": 2, "totalStudentsInClass": 45,
    "grade": "A", "principalComment": "Excellent performance..."
  }
}
```

---

## 7. API — /payments

Base: `/api/v1/payments`

| Method | Endpoint                              | Roles           | Description                            |
|--------|---------------------------------------|-----------------|----------------------------------------|
| POST   | `/initialize/paystack`                | Any auth        | Init Paystack payment → returns URL    |
| POST   | `/verify/paystack`                    | Any auth        | Verify + update + email receipt        |
| POST   | `/initialize/flutterwave`             | Any auth        | Init Flutterwave → returns URL         |
| POST   | `/manual`                             | Admin           | Record cash/bank transfer payment      |
| GET    | `/student/:studentId`                 | Admin/own/child | Payment history                        |
| GET    | `/report`                             | Admin           | Financial overview + analytics         |

### POST /payments/initialize/paystack
```json
{ "studentId": "objectId", "feeStructureId": "objectId", "amount": 45000 }
```
Response:
```json
{
  "authorizationUrl": "https://checkout.paystack.com/...",
  "reference": "SMP-A1B2C3D4"
}
```

### POST /payments/verify/paystack
```json
{ "reference": "SMP-A1B2C3D4" }
```
Response:
```json
{
  "payment": {
    "status": "Paid",
    "amountPaid": 45000,
    "receiptNumber": "RCP-123456-789",
    "gateway": "Paystack",
    "paymentDate": "2024-10-15T14:22:00.000Z"
  }
}
```
**Side effect**: Receipt email automatically sent to student's email.

### GET /payments/report
Query: `?term=First Term&academicYear=2024/2025`
```json
{
  "overview": {
    "totalExpected": 4500000,
    "totalCollected": 3150000,
    "totalOutstanding": 1350000,
    "count": 100
  },
  "byStatus": [
    { "_id": "Paid", "count": 70, "amount": 3150000 },
    { "_id": "Pending", "count": 20, "amount": 0 },
    { "_id": "Partial", "count": 10, "amount": 225000 }
  ],
  "byGateway": [
    { "_id": "Paystack", "count": 45, "amount": 2025000 },
    { "_id": "Cash", "count": 25, "amount": 1125000 }
  ],
  "recentTransactions": [...]
}
```

### Fee Structure: POST /api/v1/fees
```json
{
  "title": "JSS1 First Term 2024/2025",
  "class": "objectId",
  "term": "First Term",
  "academicYear": "2024/2025",
  "items": [
    { "label": "Tuition", "amount": 35000, "isCompulsory": true },
    { "label": "Books", "amount": 5000, "isCompulsory": true },
    { "label": "Uniform", "amount": 5000, "isCompulsory": false }
  ],
  "dueDate": "2024-10-01",
  "lateFee": 2000
}
```
`totalAmount` is auto-calculated from items sum on save.

---

## 8. RBAC

Every protected route uses:
```js
router.use(protect)          // Validates JWT, attaches req.user
router.use(authorize('Admin', 'Teacher'))  // Role check
```

| Resource          | Admin | Teacher | Student | Parent |
|-------------------|-------|---------|---------|--------|
| Create users      | ✅    | ❌      | ❌      | ❌     |
| Delete users      | ✅    | ❌      | ❌      | ❌     |
| View all students | ✅    | ✅      | ❌      | ❌     |
| Mark attendance   | ✅    | ✅      | ❌      | ❌     |
| Enter grades      | ✅    | ✅      | ❌      | ❌     |
| Publish results   | ✅    | ❌      | ❌      | ❌     |
| View own results  | ❌    | ❌      | ✅      | own child ✅ |
| Create fees       | ✅    | ❌      | ❌      | ❌     |
| Pay fees          | ✅    | ❌      | ✅      | ✅     |
| Record manual pay | ✅    | ❌      | ❌      | ❌     |
| Financial report  | ✅    | ❌      | ❌      | ❌     |
| Create announcement | ✅  | ✅      | ❌      | ❌     |
| View announcements | ✅   | ✅      | ✅      | ✅     |

---

## 9. Database Schema

### User
```
_id, firstName, lastName, email, password (hashed), role, phone, avatar, isActive
studentProfile: { admissionNumber, dateOfBirth, gender, class→Class, section, parentId→User }
teacherProfile: { staffId, qualification, classTeacherOf→Class, subjectsTaught→[Subject] }
parentProfile:  { occupation, relationship, children→[User] }
```
**Indexes**: `email`, `role`, `studentProfile.admissionNumber`, `teacherProfile.staffId`

### Class
```
_id, name, level (JSS|SS|Primary), sections[{name, capacity, classTeacher→User}],
subjects→[Subject], academicYear, isActive
```

### Attendance
```
_id, student→User, class→Class, date, status (Present|Absent|Late|Excused),
markedBy→User, term, academicYear, note
```
**Unique index**: `{ student, date }` — one record per student per day

### Result
```
_id, student→User, class→Class, subject→Subject, term, academicYear,
scores: { ca1, ca2, midTerm, exam }, totalScore (auto), grade (auto), remark (auto),
gradePoint (auto), classAverage, classHighest, classLowest, position, isPublished
```
**Unique index**: `{ student, subject, term, academicYear }`

### Fees
```
_id, title, class→Class, term, academicYear,
items: [{label, amount, isCompulsory}], totalAmount (auto-sum), dueDate, lateFee
```

### Payment
```
_id, student→User, feeStructure→Fees, term, academicYear,
amountPaid, amountDue, balance (auto), status (auto),
gateway (Paystack|Flutterwave|Cash|Bank Transfer),
transactionRef (unique), receiptNumber (unique), paymentDate
```

### Assignment
```
_id, title, description, class→Class, subject→Subject, teacher→User,
term, academicYear, dueDate, totalMarks,
attachments: [{name, url, publicId, mimeType, size}], allowLateSubmission
```

### Submission
```
_id, assignment→Assignment, student→User, submittedAt, isLate,
files: [{name, url, publicId}], comment, status, score, feedback, gradedBy→User
```
**Unique index**: `{ assignment, student }` — one submission per student

### Announcement
```
_id, title, body, author→User,
targetAudience: ['All'|'Admin'|'Teacher'|'Student'|'Parent'],
channels: {dashboard, email, sms}, priority, isPublished,
readBy: [{user, readAt}]
```

---

## 10. Payment Gateways

### Paystack (Primary — NGN)
```
Flow:
1. POST /payments/initialize/paystack → Paystack API → returns authorizationUrl
2. User pays on Paystack checkout page
3. Paystack redirects to CLIENT_URL/payments/verify
4. Frontend calls POST /payments/verify/paystack with reference
5. Server verifies with Paystack, updates Payment record, emails receipt
```

**Webhook (optional production setup):**
```js
// Add to server.js for real-time verification
app.post('/webhook/paystack', express.raw({type: 'application/json'}), (req, res) => {
  const hash = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
    .update(req.body).digest('hex');
  if (hash === req.headers['x-paystack-signature']) {
    // Process event
  }
});
```

### Flutterwave (Secondary — NGN)
Same flow pattern. Reference stored as `SMP-FLW-XXXXXXXX`.

### Currency
All amounts stored and processed in **NGN (Nigerian Naira)**.
Paystack requires kobo (×100 conversion applied in `paymentService.js`).

---

## 11. File Storage (Cloudinary)

All file uploads use `multer` (memory storage) → streamed to Cloudinary.

**Upload folders:**
| Content          | Cloudinary Path         | Max Size |
|------------------|-------------------------|----------|
| User avatars     | `smp/avatars/`          | 5MB      |
| Assignments      | `smp/assignments/`      | 10MB     |
| Submissions      | `smp/submissions/`      | 10MB     |
| Announcements    | `smp/announcements/`    | 10MB     |

**Allowed types**: Images (JPEG/PNG/GIF/WebP), PDF, DOCX, XLSX, PPTX, TXT, ZIP

**Delete on update**: Old files are deleted from Cloudinary before new ones are uploaded (avatar endpoint).

**AWS S3 (alternative):**
To switch to AWS S3, replace `fileService.js` with the `@aws-sdk/client-s3` equivalent — no other changes needed as the interface returns the same `{name, url, publicId, mimeType, size}` shape.

---

## 12. Notifications

### Email (Nodemailer + SMTP)
Triggered automatically on:
- User creation → welcome email with credentials
- Payment verified → receipt email
- Results published → parent notification
- Announcement with `channels.email = true`

Template system in `notificationService.js`:
```js
emailTemplates.welcome({ firstName, email, password, role, loginUrl })
emailTemplates.paymentReceipt({ studentName, receiptNumber, amount, term, date })
emailTemplates.announcement({ title, body, senderName })
emailTemplates.resultPublished({ studentName, term, average, position, loginUrl })
```

### SMS (Twilio)
Available for announcements with `channels.sms = true`.
Requires `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`.
Gracefully skips if Twilio is not configured.

---

## 13. Environment Variables

### Backend (.env)
```
PORT=5000
NODE_ENV=production
MONGO_URI=mongodb+srv://...
JWT_SECRET=min-32-char-secret
JWT_EXPIRE=30d
JWT_REFRESH_SECRET=another-secret
JWT_REFRESH_EXPIRE=90d
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PAYSTACK_SECRET_KEY=sk_live_...
FLUTTERWAVE_SECRET_KEY=FLWSECK_...
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=noreply@yourschool.ng
FROM_NAME=Your School Name
TWILIO_ACCOUNT_SID=          # Optional
TWILIO_AUTH_TOKEN=           # Optional
TWILIO_PHONE_NUMBER=         # Optional
CLIENT_URL=https://yourschool.ng
```

### Frontend (.env.local)
```
VITE_API_URL=https://api.yourschool.ng/api/v1
```

---

## 14. Deployment

### Backend — Railway / Render / AWS EC2
```bash
# Set all env vars in your platform dashboard
# Build command: npm install
# Start command: node server.js
```

### Frontend — Vercel (Recommended)
```bash
vercel --prod
# Set VITE_API_URL in Vercel dashboard
```

### MongoDB Atlas
- Enable IP allowlist for your backend server IP
- Create DB user with readWrite on `smp_db`
- Enable backup retention (7 days min)

### Production Checklist
- [ ] `NODE_ENV=production` (disables Morgan, hides stack traces)
- [ ] HTTPS on all endpoints (TLS termination at load balancer)
- [ ] MongoDB connection string with `?retryWrites=true&w=majority`
- [ ] Cloudinary `resource_type: 'auto'` handles all file types
- [ ] Paystack → switch from test keys to live keys
- [ ] Rate limiter configured (200 req/15min general, 20/15min for /auth)
- [ ] JWT secrets at minimum 32 characters, randomly generated
- [ ] CORS origin set to exact production frontend URL

### Microservices Migration Path
When the school's data grows, the modular service layer maps cleanly:
```
smp-auth-service      → /auth routes + User model
smp-academic-service  → classes, subjects, attendance, exams, results
smp-finance-service   → fees, payments
smp-lms-service       → assignments, submissions
smp-comms-service     → announcements, notifications
```
Each service can be extracted with its own MongoDB connection and deployed independently behind an API Gateway (AWS API GW / Kong / Nginx).

---

*Generated for Code District NG client project — SMP v1.0.0*
*Full-Stack: Node.js + Express + MongoDB + React (Vite) + Zustand*
