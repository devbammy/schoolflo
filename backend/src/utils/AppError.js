/**
 * An error the API raises deliberately, carrying the status code the client
 * should see.
 *
 * Anything thrown that is NOT an AppError is treated by the global error
 * handler as an unexpected fault: logged in full, reported to the client as a
 * generic 500. That split is what lets us stop hand-writing
 * `catch (e) { sendError(res, 500, e.message) }` in every handler — which
 * turned Mongoose validation failures into 500s and leaked internal messages
 * (and, in development, stack traces) straight to the caller.
 */
class AppError extends Error {
  constructor(statusCode, message, errors = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true; // expected, safe to show the client
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', errors = null) {
    return new AppError(400, message, errors);
  }

  static unauthorized(message = 'Authentication required') {
    return new AppError(401, message);
  }

  static forbidden(message = 'Access denied') {
    return new AppError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new AppError(404, message);
  }

  static conflict(message = 'Resource already exists') {
    return new AppError(409, message);
  }
}

module.exports = AppError;
