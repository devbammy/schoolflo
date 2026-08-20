// src/routes/auth.js
const express = require('express');
const router = express.Router();
const {
  register,
  login,
  getMe,
  updatePassword,
  forgotPassword,
  resetPassword,
  refreshToken,
  logout,
  logoutAll,
} = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  loginRules,
  registerRules,
  updatePasswordRules,
  forgotPasswordRules,
  resetPasswordRules,
  refreshRules,
} = require('../validators/authValidators');

router.post(
  '/register',
  protect,
  authorize('Admin'),
  validate(registerRules),
  register,
);
router.post('/login', validate(loginRules), login);
router.get('/me', protect, getMe);
router.put(
  '/update-password',
  protect,
  validate(updatePasswordRules),
  updatePassword,
);
router.post('/forgot-password', validate(forgotPasswordRules), forgotPassword);
router.put(
  '/reset-password/:token',
  validate(resetPasswordRules),
  resetPassword,
);
router.post('/refresh', validate(refreshRules), refreshToken);
router.post('/logout', protect, logout);
router.post('/logout-all', protect, logoutAll);

module.exports = router;
