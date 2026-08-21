const { body } = require('express-validator');
const { PAYMENT_GATEWAY } = require('../config/constants');
const {
  objectIdBody,
  objectIdParam,
  stringBody,
  amountBody,
  termBody,
  academicYearBody,
  dateBody,
} = require('./common');

const MANUAL_GATEWAYS = [PAYMENT_GATEWAY.CASH, PAYMENT_GATEWAY.BANK_TRANSFER];

/**
 * Payment initialization.
 *
 * `amount` is optional by design: omitting it means "settle the outstanding
 * balance in full", and the server computes that itself. When present it is
 * only a part-payment request, and resolvePayableAmount() still refuses
 * anything above what is actually owed — validation here just ensures it is a
 * sane number before it gets that far.
 */
const initPaymentRules = [
  objectIdBody('studentId', 'Student'),
  objectIdBody('feeStructureId', 'Fee structure'),
  amountBody('amount', 'Amount', { optional: true }),
];

const verifyPaymentRules = [
  stringBody('reference', 'Payment reference', { min: 4, max: 100 }),
];

/**
 * Over-the-counter entry. `amountPaid` is a part-payment like any other —
 * the controller caps it at what the fee still owes after online payments,
 * so the two channels can settle one fee between them.
 */
const manualPaymentRules = [
  objectIdBody('studentId', 'Student'),
  objectIdBody('feeStructureId', 'Fee structure'),
  body('amountPaid')
    .exists({ checkFalsy: true })
    .withMessage('Amount paid is required.')
    .bail()
    .isFloat({ gt: 0 })
    .withMessage('Amount paid must be greater than zero.')
    .toFloat(),
  body('gateway')
    .optional({ values: 'falsy' })
    .isIn(MANUAL_GATEWAYS)
    .withMessage(`Gateway must be one of: ${MANUAL_GATEWAYS.join(', ')}.`),
  stringBody('notes', 'Notes', { optional: true, max: 500 }),
];

const feeItemRules = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('At least one fee item is required.'),
  body('items.*.label')
    .exists({ checkFalsy: true })
    .withMessage('Every fee item needs a label.')
    .bail()
    .isString()
    .trim()
    .isLength({ max: 120 })
    .withMessage('Fee item label is too long.'),
  body('items.*.amount')
    .isFloat({ min: 0 })
    .withMessage('Every fee item amount must be a positive number.')
    .toFloat(),
  body('items.*.isCompulsory')
    .optional()
    .isBoolean()
    .withMessage('isCompulsory must be true or false.')
    .toBoolean(),
];

const createFeeRules = [
  stringBody('title', 'Title', { min: 2, max: 150 }),
  objectIdBody('class', 'Class'),
  termBody(),
  academicYearBody(),
  ...feeItemRules,
  dateBody('dueDate', 'Due date'),
  amountBody('lateFee', 'Late fee', { optional: true }),
];

const updateFeeRules = [
  objectIdParam('id', 'Fee structure id'),
  stringBody('title', 'Title', { optional: true, min: 2, max: 150 }),
  termBody('term', { optional: true }),
  academicYearBody('academicYear', { optional: true }),
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one fee item is required.'),
  body('items.*.amount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Every fee item amount must be a positive number.')
    .toFloat(),
  dateBody('dueDate', 'Due date'),
  amountBody('lateFee', 'Late fee', { optional: true }),
];

module.exports = {
  initPaymentRules,
  verifyPaymentRules,
  manualPaymentRules,
  createFeeRules,
  updateFeeRules,
};
