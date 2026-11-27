require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const axios = require('axios');

const connectDB = require('./src/config/db');
const { getFeatures } = require('./src/config/features');
const { validateEnv } = require('./src/config/env');
const MongoRateLimitStore = require('./src/middleware/rateLimitStore');
const {
  byUserOrIp,
  byLoginTarget,
  byIp,
} = require('./src/middleware/rateLimitKeys');
const errorHandler = require('./src/middleware/errorHandler');
const { verifyTransport } = require('./src/services/notificationService');
const { startJobQueue, stopJobQueue } = require('./src/services/jobQueue');

// Route imports
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const classRoutes = require('./src/routes/classes');
const subjectRoutes = require('./src/routes/subjects');
const attendanceRoutes = require('./src/routes/attendance');
const staffAttendanceRoutes = require('./src/routes/staffAttendance');
const examRoutes = require('./src/routes/exams');
const resultRoutes = require('./src/routes/results');
const feesRoutes = require('./src/routes/fees');
const paymentRoutes = require('./src/routes/payments');
const assignmentRoutes = require('./src/routes/assignments');
const submissionRoutes = require('./src/routes/submissions');
const announcementRoutes = require('./src/routes/announcements');
const dashboardRoutes = require('./src/routes/dashboard');
const parentRoutes = require('./src/routes/parent');
const timetableRoutes = require('./src/routes/timetables');
const libraryRoutes = require('./src/routes/library');
const calendarRoutes = require('./src/routes/calendar');
const examScheduleRoutes = require('./src/routes/examSchedule.routes');
const caTrackingRoutes = require('./src/routes/caTracking.routes');
const reportRemarkRoutes = require('./src/routes/reportRemarks');
const schoolSettingsRoutes = require('./src/routes/schoolSettings');
const promotionRoutes = require('./src/routes/promotion.routes');
const certificateRoutes = require('./src/routes/certificate.routes');
const webhookRoutes = require('./src/routes/webhooks');
const auditRoutes = require('./src/routes/audit');
const taskRoutes = require('./src/routes/tasks');
const searchRoutes = require('./src/routes/search');
const configRoutes = require('./src/routes/config');

// Before anything is mounted or listening: a missing secret should stop the
// deploy here, not surface as a 500 on the first sign-in.
validateEnv();

const app = express();

app.set('trust proxy', 1);

app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// Security Middleware

// An explicit list, matched exactly. CLIENT_URL may hold several comma
// separated origins. The previous substring match on a single string would
// have admitted `https://schoolflo.vercel.app.attacker.com`.
//
// Nothing beyond the dev server is built in. One school's address used to sit in
// this list, so every other school's production API trusted that origin as well
// as its own. env.js refuses to start in production without CLIENT_URL.
const DEFAULT_ORIGINS =
  process.env.NODE_ENV === 'production' ? [] : ['http://localhost:5173'];

const normalizeOrigin = (origin) => origin.trim().replace(/\/$/, '');

const allowedOrigins = [
  ...new Set(
    [...(process.env.CLIENT_URL || '').split(','), ...DEFAULT_ORIGINS]
      .map(normalizeOrigin)
      .filter(Boolean),
  ),
];

if (!process.env.CLIENT_URL) {
  console.warn(
    '⚠️  CLIENT_URL is not set — falling back to default CORS origins:',
    DEFAULT_ORIGINS.join(', '),
  );
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow mobile apps / Postman / server requests
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(normalizeOrigin(origin))) {
        return callback(null, true);
      }

      // Flagged operational so a blocked origin gets a clean 403 instead of
      // being logged and reported as an unexpected server fault.
      const err = new Error('This origin is not allowed by CORS policy.');
      err.statusCode = 403;
      err.isOperational = true;
      return callback(err);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

app.use(compression());

// Which features this school runs. Resolved once at boot so a bad
// SCHOOL_PROFILE fails here, loudly, rather than at the first request.
const features = getFeatures();

// Gateway webhooks are mounted ahead of the JSON parser: signature
// verification needs the untouched raw body. They sit outside /api so the
// rate limiter cannot reject a genuine payment notification. A school with no
// gateway has nothing to receive, so the endpoint does not exist for them.
if (features.onlinePayments) {
  app.use('/webhooks', webhookRoutes);
}

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(mongoSanitize());
app.use(hpp());

// `xss-clean` used to sit here. It was removed rather than replaced:
//   - it has been unmaintained since 2019 and is deprecated by its author
//   - it HTML-escapes every request field in place, so legitimate input is
//     silently corrupted on the way in ("R&D" stored as "R&amp;D")
//   - it defends the wrong layer. XSS is an output concern, and this API's
//     only consumer is React, which escapes everything it renders. Nothing in
//     the client uses dangerouslySetInnerHTML.
//
// If a field is ever rendered as raw HTML (a rich-text announcement body, say)
// sanitize that specific field on write with `sanitize-html` — do not reach
// for a blanket request-mangling middleware again.

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate Limiting
//
// Counters live in MongoDB rather than in this process's memory. An in-memory
// limiter is per-instance: two instances behind a load balancer silently
// double every allowance, and a deploy resets them all to zero. See
// src/middleware/rateLimitStore.js — it fails open, so a database blip
// degrades the limit rather than locking everyone out.
// Every limit below is configurable, because "how much traffic is normal"
// depends on the school. A 40-pupil primary and a 2,000-pupil college cannot
// share one number, and a hard-coded one can only be changed by a deploy.
const minutes = (value, fallback) => (Number(value) || fallback) * 60 * 1000;
const count = (value, fallback) => Number(value) || fallback;

const RATE_WINDOW_MS = minutes(process.env.RATE_LIMIT_WINDOW_MINUTES, 15);

// Counted per ACCOUNT, not per IP. A school NATs its whole staff room behind
// one address; keying on IP meant thirty teachers shared one budget, and a
// measured run had the twelfth person to sign in on a Monday refused.
const limiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: count(process.env.RATE_LIMIT_MAX, 600),
  keyGenerator: byUserOrIp,
  store: new MongoRateLimitStore({ prefix: 'api' }),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

// Only the routes where credentials are actually submitted belong under the
// strict limiter. Applying it to the whole /auth router throttled `/auth/me`
// and `/auth/refresh` too — and since those carry no email to key on, they
// fell back to per-IP, which put the entire school back on one small budget.
// Everything under /api is still covered by the main per-account limiter.
const CREDENTIAL_PATHS = ['/login', '/forgot-password', '/reset-password'];
const isCredentialSubmission = (req) =>
  CREDENTIAL_PATHS.some((p) => req.path.startsWith(p));

// Login, counted per ACCOUNT BEING ATTEMPTED. Brute force is an attack on one
// account, so that is what the budget protects — and one member of staff
// fumbling their password no longer locks out the rest of the school.
const authLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: count(process.env.AUTH_RATE_LIMIT_MAX, 10),
  keyGenerator: byLoginTarget,
  skip: (req) => !isCredentialSubmission(req),
  store: new MongoRateLimitStore({ prefix: 'auth' }),
  message: {
    success: false,
    message:
      'Too many attempts for this account. Try again later, or reset your password.',
  },
});

// A loose ceiling per host, so that making the login budget per-account does
// not hand one machine a free run at a list of addresses. Set far above what a
// whole staff room signing in at 07:45 will ever reach.
const authHostLimiter = rateLimit({
  windowMs: RATE_WINDOW_MS,
  max: count(process.env.AUTH_RATE_LIMIT_PER_HOST, 200),
  keyGenerator: byIp,
  skip: (req) => !isCredentialSubmission(req),
  store: new MongoRateLimitStore({ prefix: 'auth-host' }),
  message: {
    success: false,
    message: 'Too many attempts from this network, please try again later.',
  },
});

app.use('/api/', limiter);

// Health Check
app.get('/health', async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      status: 'OK',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      memoryUsage: process.memoryUsage(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'FAILED',
    });
  }
});

// API Routes
app.use('/api/v1/auth', authHostLimiter, authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/attendance', attendanceRoutes);

// A whole domain that a school does not run is not mounted at all — there is
// no route to guard. Features that live inside a router the school still
// needs are guarded individually instead (see routes/payments.js).
if (features.staffAttendance) {
  app.use('/api/v1/staff-attendance', staffAttendanceRoutes);
}
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/results', resultRoutes);
app.use('/api/v1/report-remarks', reportRemarkRoutes);
app.use('/api/v1/school-settings', schoolSettingsRoutes);
app.use('/api/v1/fees', feesRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/assignments', assignmentRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/parents', parentRoutes);
app.use('/api/v1/timetables', timetableRoutes);
app.use('/api/v1/library', libraryRoutes);
app.use('/api/v1/calendar', calendarRoutes);
app.use('/api/v1/exam-schedules', examScheduleRoutes);
app.use('/api/v1/ca-tracking', caTrackingRoutes);
app.use('/api/v1/promotions', promotionRoutes);
app.use('/api/v1/certificates', certificateRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/search', searchRoutes);
app.use('/api/v1/config', configRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'School Management API is running...',
  });
});

// Keep-alive
app.get('/keep-alive', (_, res) => res.status(204).end());

const KEEP_ALIVE =
  process.env.KEEP_ALIVE === 'true' || process.env.NODE_ENV === 'production';

// This school's own address: PING_URL, or the one Render publishes. It used to
// fall back to one fixed deployment's URL, so every other school in production
// sent that one traffic and never kept itself awake.
const PING_URL =
  process.env.PING_URL ||
  (process.env.RENDER_EXTERNAL_URL
    ? `${process.env.RENDER_EXTERNAL_URL.replace(/\/$/, '')}/keep-alive`
    : null);

if (process.env.KEEP_ALIVE === 'true' && !PING_URL) {
  console.warn('⚠️  KEEP_ALIVE is on but PING_URL is not set: not pinging.');
}

if (KEEP_ALIVE && PING_URL) {
  setInterval(
    async () => {
      try {
        await axios.get(PING_URL);
        console.log('💓 Keep-alive ping sent');
      } catch (err) {
        console.error('❌ Ping failed:', err.message);
      }
    },
    1000 * 60 * 14,
  );
}

// 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global Error Handler
app.use(errorHandler);

// 5000 is what the client's dev proxy and the documentation assume; this said
// 5001, so a local run with no PORT set was unreachable from the client.
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    // Checked once here rather than before every send, which previously added
    // a round trip to each email. Non-fatal: the app runs without email.
    verifyTransport();

    // Needs the Mongo connection above. Non-fatal: if it fails to start,
    // enqueueEmail() falls back to sending inline.
    await startJobQueue();

    const server = app.listen(PORT, () => {
      console.log(`
🚀 Server running in ${process.env.NODE_ENV} mode
📡 Port: ${PORT}
🌐 API: http://localhost:${PORT}/api/v1
❤️  Health: http://localhost:${PORT}/health
      `);
    });

    const shutdown = (signal) => {
      console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);

      server.close(async () => {
        console.log('✅ HTTP server closed');

        // Let in-flight jobs finish rather than killing them mid-send.
        await stopJobQueue().catch(() => {});

        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    process.on('unhandledRejection', (err) => {
      console.error(`❌ Unhandled Rejection: ${err.message}`);

      server.close(() => {
        process.exit(1);
      });
    });

    process.on('uncaughtException', (err) => {
      console.error(`❌ Uncaught Exception: ${err.message}`);

      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
