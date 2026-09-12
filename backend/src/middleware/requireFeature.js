const { isEnabled } = require('../config/features');
const AppError = require('../utils/AppError');

/**
 * Refuse a route that belongs to a feature this school does not run.
 *
 * Used for a feature that lives *inside* a router the school still needs —
 * the payment gateway routes sit alongside manual payments, balances and the
 * financial report, all of which a cash-only school uses daily. A whole
 * domain that goes away entirely (staff attendance) is better handled by not
 * mounting its router at all in server.js; there is nothing to guard.
 *
 * 404, not 403. A feature that is not part of this deployment does not exist
 * here, and saying "forbidden" would imply it is a permission the caller
 * might be granted.
 */
const requireFeature = (feature) => (req, res, next) => {
  if (!isEnabled(feature)) {
    return next(
      AppError.notFound('This feature is not enabled for this school.'),
    );
  }
  next();
};

module.exports = requireFeature;
