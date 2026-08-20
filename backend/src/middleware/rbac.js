const { sendError } = require('../utils/apiResponse');

/**
 * Role-Based Access Control middleware
 * @param {...string} roles - Allowed roles
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return sendError(res, 401, 'Authentication required.');
    }

    if (!roles.includes(req.user.role)) {
      return sendError(
        res,
        403,
        `Access denied. Role '${req.user.role}' is not authorized for this resource.`,
      );
    }
    next();
  };
};

/**
 * Ensure a student/parent can only access their own data
 */
const ownDataOnly = (paramField = 'id') => {
  return (req, res, next) => {
    const { role, _id } = req.user;

    // Admins and Teachers can access anything
    if (['Admin', 'Teacher'].includes(role)) return next();

    const resourceId = req.params[paramField];
    if (String(_id) !== String(resourceId)) {
      return sendError(res, 403, 'You can only access your own data.');
    }
    next();
  };
};

module.exports = { authorize, ownDataOnly };
