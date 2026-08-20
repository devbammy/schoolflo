const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const validate = require('../middleware/validate');
const {
  getAnnouncements,
  createAnnouncement,
  markAsRead,
  deleteAnnouncement,
} = require('../controllers/announcementController');
const {
  createAnnouncementRules,
  idParam,
} = require('../validators/academicValidators');

router.get('/', protect, getAnnouncements);

router.post(
  '/',
  protect,
  authorize('Admin', 'Teacher'),
  validate(createAnnouncementRules),
  createAnnouncement,
);

router.patch('/:id/read', protect, validate(idParam), markAsRead);

router.delete(
  '/:id',
  protect,
  authorize('Admin'),
  validate(idParam),
  deleteAnnouncement,
);

module.exports = router;
