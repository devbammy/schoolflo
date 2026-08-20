const Announcement = require('../models/Announcement');
const User = require('../models/User');
const { sendSuccess } = require('../utils/apiResponse');
const AppError = require('../utils/AppError');
const { emailTemplates } = require('../services/notificationService');
const { enqueueBulkEmail } = require('../services/jobQueue');

const ALL_ROLES = ['Admin', 'Teacher', 'Student', 'Parent'];

// @desc    Announcements visible to the caller's role
// @route   GET /api/v1/announcements
// @access  Any authenticated user
const getAnnouncements = async (req, res) => {
  const announcements = await Announcement.find({
    isPublished: true,
    $or: [{ targetAudience: 'All' }, { targetAudience: req.user.role }],
  })
    .populate('author', 'firstName lastName role')
    .sort({ publishedAt: -1 })
    .limit(50);

  return sendSuccess(res, 200, 'Announcements fetched', { announcements });
};

/**
 * Email everyone in the announcement's target audience.
 * Never allowed to fail the request — the announcement is already saved.
 */
const emailAudience = async (announcement, author) => {
  const targetRoles = announcement.targetAudience.includes('All')
    ? ALL_ROLES
    : announcement.targetAudience;

  const recipients = await User.find({
    role: { $in: targetRoles },
    isActive: true,
    email: { $exists: true, $ne: '' },
  }).select('email firstName lastName');

  if (!recipients.length) return 0;

  // Queued rather than sent inline: a whole-school announcement can be
  // hundreds of messages, and the author should not be left waiting on SMTP
  // for all of them before their request returns.
  const html = emailTemplates.announcement({
    title: announcement.title,
    body: announcement.body,
    senderName: `${author.firstName} ${author.lastName}`,
  });

  const { queued } = await enqueueBulkEmail(recipients, (recipient) => ({
    to: recipient.email,
    subject: announcement.title,
    html,
  }));

  return queued;
};

// @desc    Create an announcement, optionally publishing it straight away
// @route   POST /api/v1/announcements
// @access  Admin, Teacher
const createAnnouncement = async (req, res) => {
  const announcement = await Announcement.create({
    ...req.body,
    author: req.user._id,
  });

  if (req.body.publish) {
    announcement.isPublished = true;
    announcement.publishedAt = new Date();

    if (req.body.channels?.email) {
      try {
        const sent = await emailAudience(announcement, req.user);
        announcement.emailStatus = {
          sent: true,
          sentAt: new Date(),
          recipients: sent,
        };
      } catch (error) {
        console.error(
          `Announcement ${announcement._id} email fan-out failed: ${error.message}`,
        );
      }
    }

    await announcement.save();
  }

  return sendSuccess(res, 201, 'Announcement created', { announcement });
};

// @desc    Mark an announcement read by the caller
// @route   PATCH /api/v1/announcements/:id/read
// @access  Any authenticated user
const markAsRead = async (req, res) => {
  const announcement = await Announcement.findByIdAndUpdate(req.params.id, {
    $addToSet: { readBy: { user: req.user._id, readAt: new Date() } },
  });

  if (!announcement) throw AppError.notFound('Announcement not found');

  return sendSuccess(res, 200, 'Marked as read');
};

// @desc    Delete an announcement
// @route   DELETE /api/v1/announcements/:id
// @access  Admin
const deleteAnnouncement = async (req, res) => {
  const announcement = await Announcement.findByIdAndDelete(req.params.id);
  if (!announcement) throw AppError.notFound('Announcement not found');

  return sendSuccess(res, 200, 'Announcement deleted');
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  markAsRead,
  deleteAnnouncement,
  emailAudience,
};
