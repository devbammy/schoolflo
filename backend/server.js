require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
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

const app = express();

// Connect to MongoDB
connectDB();

// Security Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});
app.use('/api/', limiter);

// Auth-specific strict limiter
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.',
  },
});

// Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Health Check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0',
  });
});

// API Routes
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

// 404 Handler
app.use('*', (req, res) => {
  res
    .status(404)
    .json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(
    `\n🚀 SMP Server running in ${process.env.NODE_ENV} mode on port ${PORT}`,
  );
  console.log(`📡 API Base: http://localhost:${PORT}/api/v1`);
  console.log(`❤️  Health: http://localhost:${PORT}/health\n`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error(`❌ Unhandled Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = server;
