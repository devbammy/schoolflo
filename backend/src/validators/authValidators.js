const { body, param } = require('express-validator');
const { stringBody, ROLE_VALUES, optionalObjectIdBody } = require('./common');

const emailRule = (field = 'email') =>
  body(field)
    .exists({ checkFalsy: true })
    .withMessage('Email is required.')
    .bail()
    .isEmail()
    .withMessage('Enter a valid email address.')
    .normalizeEmail({ gmail_remove_dots: false });

/**
 * Password strength. Deliberately length-led rather than a thicket of
 * character-class rules: length is what actually resists offline cracking, and
 * complexity requirements push people towards `Password1!`.
 */
const passwordRule = (field = 'password', label = 'Password') =>
  body(field)
    .exists({ checkFalsy: true })
    .withMessage(`${label} is required.`)
    .bail()
    .isString()
    .withMessage(`${label} must be text.`)
    .bail()
    .isLength({ min: 8, max: 128 })
    .withMessage(`${label} must be between 8 and 128 characters.`);

const loginRules = [
  emailRule(),
  body('password').exists({ checkFalsy: true }).withMessage('Password is required.'),
];

const registerRules = [
  stringBody('firstName', 'First name', { min: 1, max: 50 }),
  stringBody('lastName', 'Last name', { min: 1, max: 50 }),
  emailRule(),
  passwordRule(),
  body('role')
    .exists({ checkFalsy: true })
    .withMessage('Role is required.')
    .bail()
    .isIn(ROLE_VALUES)
    .withMessage(`Role must be one of: ${ROLE_VALUES.join(', ')}.`),
  body('phone')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Phone number is too long.'),
  optionalObjectIdBody('studentProfile.class', 'Class'),
  optionalObjectIdBody('teacherProfile.classTeacherOf', 'Class'),
  body('studentProfile.gender')
    .optional({ values: 'falsy' })
    .isIn(['Male', 'Female', 'Other'])
    .withMessage('Gender must be Male, Female or Other.'),
  body('studentProfile.dateOfBirth')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Date of birth must be a valid date.'),
];

const updatePasswordRules = [
  body('currentPassword')
    .exists({ checkFalsy: true })
    .withMessage('Current password is required.'),
  passwordRule('newPassword', 'New password').custom((value, { req }) => {
    if (value === req.body.currentPassword) {
      throw new Error('New password must be different from the current one.');
    }
    return true;
  }),
];

const forgotPasswordRules = [emailRule()];

const resetPasswordRules = [
  param('token')
    .isString()
    .isLength({ min: 32, max: 128 })
    .withMessage('Invalid reset token.'),
  passwordRule(),
];

const refreshRules = [
  body('refreshToken')
    .exists({ checkFalsy: true })
    .withMessage('Refresh token is required.')
    .bail()
    .isJWT()
    .withMessage('Invalid refresh token.'),
];

module.exports = {
  loginRules,
  registerRules,
  updatePasswordRules,
  forgotPasswordRules,
  resetPasswordRules,
  refreshRules,
};
