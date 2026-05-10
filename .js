require('dotenv').config();
require('express-async-errors');

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

const connectDB = require('./src/config/db');
const errorHandler = require('./src/middleware/errorHandler');

// Route imports
const authRoutes = require('./src/routes/auth');
const userRoutes = require('./src/routes/users');
const classRoutes = require('./src/routes/classes');
const subjectRoutes = require('./src/routes/subjects');
const attendanceRoutes = require('./src/routes/attendance');
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

const app = express();

/*
|--------------------------------------------------------------------------
| Trust Proxy
|--------------------------------------------------------------------------
*/
app.set('trust proxy', 1);

/*
|--------------------------------------------------------------------------
| Security
|--------------------------------------------------------------------------
*/
app.disable('x-powered-by');

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

/*
|--------------------------------------------------------------------------
| CORS
|--------------------------------------------------------------------------
*/
const allowedOrigins = process.env.CLIENT_URLS
  ? process.env.CLIENT_URLS.split(',').map((origin) => origin.trim())
  : ['http://localhost:5173'];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow mobile apps / Postman / server requests
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS policy violation'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

/*
|--------------------------------------------------------------------------
| Global Middleware
|--------------------------------------------------------------------------
*/
app.use(compression());

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

/*
|--------------------------------------------------------------------------
| Logging
|--------------------------------------------------------------------------
*/
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

/*
|--------------------------------------------------------------------------
| Rate Limiting
|--------------------------------------------------------------------------
*/
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests. Please try again later.',
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.',
  },
});

app.use('/api/', apiLimiter);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/
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

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/classes', classRoutes);
app.use('/api/v1/subjects', subjectRoutes);
app.use('/api/v1/attendance', attendanceRoutes);
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

/*
|--------------------------------------------------------------------------
| Root Route
|--------------------------------------------------------------------------
*/
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'School Management API is running...',
  });
});

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/
app.use(errorHandler);

/*
|--------------------------------------------------------------------------
| Server Startup
|--------------------------------------------------------------------------
*/
const PORT = process.env.PORT || 5001;

const startServer = async () => {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`
🚀 Server running in ${process.env.NODE_ENV} mode
📡 Port: ${PORT}
🌐 API: http://localhost:${PORT}/api/v1
❤️  Health: http://localhost:${PORT}/health
      `);
    });

    /*
    |--------------------------------------------------------------------------
    | Graceful Shutdown
    |--------------------------------------------------------------------------
    */
    const shutdown = (signal) => {
      console.log(`\n⚠️  ${signal} received. Shutting down gracefully...`);

      server.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    /*
    |--------------------------------------------------------------------------
    | Unhandled Promise Rejection
    |--------------------------------------------------------------------------
    */
    process.on('unhandledRejection', (err) => {
      console.error(`❌ Unhandled Rejection: ${err.message}`);

      server.close(() => {
        process.exit(1);
      });
    });

    /*
    |--------------------------------------------------------------------------
    | Uncaught Exceptions
    |--------------------------------------------------------------------------
    */
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
