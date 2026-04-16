// src/routes/auth.js
const express = require('express');
const router = express.Router();
const { register, login, getMe, updatePassword, forgotPassword, resetPassword, refreshToken } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');

router.post('/register', protect, authorize('Admin'), register);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/update-password', protect, updatePassword);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);
router.post('/refresh', refreshToken);

module.exports = router;
