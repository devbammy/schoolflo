const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { getAdminDashboard, getTeacherDashboard, getStudentDashboard, getParentDashboard } = require('../controllers/dashboardController');

router.get('/admin', protect, authorize('Admin'), getAdminDashboard);
router.get('/teacher', protect, authorize('Teacher'), getTeacherDashboard);
router.get('/student', protect, authorize('Student'), getStudentDashboard);
router.get('/parent', protect, authorize('Parent'), getParentDashboard);

module.exports = router;
