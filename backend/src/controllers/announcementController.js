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
  const now = new Date();

  const announcements = await Announcement.find({
    isPublished: true,
    $and: [
      { $or: [{ targetAudience: 'All' }, { targetAudience: req.user.role }] },
      // `expiresAt` was stored and never read, so an announcement meant to run
      // until Friday stayed on every dashboard for good.
      { $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }] },
    ],
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
  // Named fields only. `...req.body` let any Teacher set isPublished,
  // publishedAt, readBy or emailStatus directly, which skipped the publish
  // step below and forged the "sent to N recipients" record.
  const { title, body, targetAudience, priority, channels, expiresAt } =
    req.body;

  const announcement = await Announcement.create({
    title,
    body,
    targetAudience,
    priority,
    channels,
    expiresAt,
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
  const visible = {
    _id: req.params.id,
    isPublished: true,
    targetAudience: { $in: ['All', req.user.role] },
  };

  // One entry per reader. $addToSet compared the whole sub-document, and
  // `readAt` differs on every call, so it never recognised a repeat and the
  // list grew with each click. The filter below only matches while this user
  // is absent from it.
  const updated = await Announcement.findOneAndUpdate(
    { ...visible, 'readBy.user': { $ne: req.user._id } },
    { $push: { readBy: { user: req.user._id, readAt: new Date() } } },
  );

  if (!updated && !(await Announcement.exists(visible))) {
    // Not found, a draft, or meant for another audience — the same answer.
    throw AppError.notFound('Announcement not found');
  }

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
