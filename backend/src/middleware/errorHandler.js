const AppError = require('../utils/AppError');

/**
 * Global error handler.
 *
 * Anything a handler throws lands here (express-async-errors forwards
 * rejected promises), so handlers no longer need their own try/catch.
 *
 * The rule: errors we raised on purpose (AppError) and known Mongoose faults
 * are described to the client. Everything else is an unexpected fault — logged
 * in full server side, reported as a generic 500. The previous version echoed
 * `err.message` for any unrecognised error, which handed internal database and
 * driver messages to whoever triggered them.
 */
const errorHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let statusCode = 500;
  let message = 'Something went wrong. Please try again.';
  let errors = null;
  let expected = false;

  if (err instanceof AppError || err.isOperational) {
    statusCode = err.statusCode || 400;
    message = err.message;
    errors = err.errors || null;
    expected = true;
  } else if (err.name === 'CastError') {
    // Mongoose bad ObjectId
    statusCode = 400;
    // A whole object can fail to cast (a form section, say), and quoting it
    // printed "'[object Object]' is not a valid sections".
    message =
      err.value !== null && typeof err.value === 'object'
        ? `Invalid value for ${err.path || 'a field'}.`
        : `'${err.value}' is not a valid ${err.path || 'id'}.`;
    expected = true;
  } else if (err.code === 11000) {
    // Mongoose duplicate key
    const field = Object.keys(err.keyValue || {})[0];
    statusCode = 409;
    message = field
      ? `That ${field} is already in use.`
      : 'That value is already in use.';
    expected = true;
  } else if (err.name === 'ValidationError') {
    // Mongoose schema validation
    errors = Object.values(err.errors || {}).map((v) => v.message);
    statusCode = 400;
    message = errors.join(' ') || 'Validation failed.';
    expected = true;
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token. Please log in again.';
    expected = true;
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Your session has expired. Please log in again.';
    expected = true;
  }

  // Unexpected faults are always logged in full, in every environment —
  // this is the only record that they happened.
  if (!expected) {
    console.error(
      `❌ ${req.method} ${req.originalUrl} — ${err.name}: ${err.message}`,
    );
    console.error(err.stack);
  } else if (process.env.NODE_ENV === 'development') {
    console.error(`⚠️  ${req.method} ${req.originalUrl} — ${message}`);
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;

  // Stack traces are a development aid only, and only for genuine faults.
  if (process.env.NODE_ENV === 'development' && !expected) {
    body.stack = err.stack;
  }

  return res.status(statusCode).json(body);
};

module.exports = errorHandler;
