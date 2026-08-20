const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Run a set of express-validator chains and reject the request if any failed.
 *
 * Usage:
 *   router.post('/', protect, validate(createFeeRules), handler)
 *
 * Every mutating route should carry one of these. Without them each handler
 * destructured req.body raw, which is how an attacker-chosen `amount` reached
 * the payment gateway and how negative scores reached the results collection.
 */
const validate = (rules = []) => [
  ...rules,
  (req, res, next) => {
    const result = validationResult(req);
    if (result.isEmpty()) return next();

    const errors = result.array().map((e) => ({
      field: e.path ?? e.param,
      message: e.msg,
    }));

    return next(
      AppError.badRequest(errors.map((e) => e.message).join(' '), errors),
    );
  },
];

module.exports = validate;
