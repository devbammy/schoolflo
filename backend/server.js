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
const MongoRateLimitStore = require('./src/middleware/rateLimitStore');
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
const promotionRoutes = require('./src/routes/promotion.routes');
const certificateRoutes = require('./src/routes/certificate.routes');
const webhookRoutes = require('./src/routes/webhooks');
const auditRoutes = require('./src/routes/audit');
const taskRoutes = require('./src/routes/tasks');
const searchRoutes = require('./src/routes/search');

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
const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'https://schoolflo.vercel.app',
];

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

// Gateway webhooks are mounted ahead of the JSON parser: signature
// verification needs the untouched raw body. They sit outside /api so the
// rate limiter cannot reject a genuine payment notification.
app.use('/webhooks', webhookRoutes);

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
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  store: new MongoRateLimitStore({ prefix: 'api' }),
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

// Auth-specific strict limiter. Its own prefix, so a user's ordinary API
// traffic and their login attempts are counted separately.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  store: new MongoRateLimitStore({ prefix: 'auth' }),
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.',
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
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
app.use('/api/v1/staff-attendance', staffAttendanceRoutes);
app.use('/api/v1/exams', examRoutes);
app.use('/api/v1/results', resultRoutes);
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

const PING_URL =
  process.env.PING_URL || 'https://schoolflo-xyo9.onrender.com/keep-alive';

if (KEEP_ALIVE) {
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

const PORT = process.env.PORT || 5001;

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
