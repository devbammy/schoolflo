const express = require('express');
const router = express.Router();
const Announcement = require('../models/Announcement');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/rbac');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { sendBulkEmails, sendSMS, emailTemplates } = require('../services/notificationService');
const User = require('../models/User');

router.get('/', protect, async (req, res) => {
  try {
    const role = req.user.role;
    const announcements = await Announcement.find({
      isPublished: true,
      $or: [{ targetAudience: 'All' }, { targetAudience: role }],
    })
      .populate('author', 'firstName lastName role')
      .sort({ publishedAt: -1 })
      .limit(50);
    return sendSuccess(res, 200, 'Announcements fetched', { announcements });
  } catch (err) { return sendError(res, 500, err.message); }
});

router.post('/', protect, authorize('Admin', 'Teacher'), async (req, res) => {
  try {
    const ann = await Announcement.create({ ...req.body, author: req.user._id });

    // Publish immediately if requested
    if (req.body.publish) {
      ann.isPublished = true;
      ann.publishedAt = new Date();

      if (req.body.channels?.email) {
        const targetRoles = ann.targetAudience.includes('All')
          ? ['Admin', 'Teacher', 'Student', 'Parent']
          : ann.targetAudience;

        const recipients = await User.find({ role: { $in: targetRoles }, isActive: true })
          .select('email firstName lastName');

        const { sent, failed } = await sendBulkEmails(
          recipients,
          ann.title,
          (r) => emailTemplates.announcement({
            title: ann.title,
            body: ann.body,
            senderName: `${req.user.firstName} ${req.user.lastName}`,
          })
        );

        ann.emailStatus = { sent: true, sentAt: new Date(), recipients: sent };
      }

      await ann.save();
    }

    return sendSuccess(res, 201, 'Announcement created', { announcement: ann });
  } catch (err) { return sendError(res, 500, err.message); }
});

// Mark as read
router.patch('/:id/read', protect, async (req, res) => {
  try {
    await Announcement.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: { user: req.user._id, readAt: new Date() } },
    });
    return sendSuccess(res, 200, 'Marked as read');
  } catch (err) { return sendError(res, 500, err.message); }
});

router.delete('/:id', protect, authorize('Admin'), async (req, res) => {
  try {
    await Announcement.findByIdAndDelete(req.params.id);
    return sendSuccess(res, 200, 'Announcement deleted');
  } catch (err) { return sendError(res, 500, err.message); }
});

module.exports = router;
