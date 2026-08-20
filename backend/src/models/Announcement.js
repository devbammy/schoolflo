const mongoose = require('mongoose');
const { ANNOUNCEMENT_TARGET } = require('../config/constants');

const AnnouncementSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    body: {
      type: String,
      required: [true, 'Announcement body is required'],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    targetAudience: {
      type: [String],
      enum: Object.values(ANNOUNCEMENT_TARGET),
      default: [ANNOUNCEMENT_TARGET.ALL],
    },
    targetClasses: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Class',
      },
    ],
    channels: {
      dashboard: { type: Boolean, default: true },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false },
    },
    priority: {
      type: String,
      enum: ['Low', 'Normal', 'High', 'Urgent'],
      default: 'Normal',
    },
    attachments: [
      {
        name: String,
        url: String,
        publicId: String,
        // image | video | raw — Cloudinary needs this to delete the file later.
        resourceType: String,
      },
    ],
    scheduledAt: Date,
    expiresAt: Date,
    isPublished: { type: Boolean, default: false },
    publishedAt: Date,
    readBy: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        readAt: { type: Date, default: Date.now },
      },
    ],
    emailStatus: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      recipients: Number,
      failed: [String],
    },
    smsStatus: {
      sent: { type: Boolean, default: false },
      sentAt: Date,
      recipients: Number,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

AnnouncementSchema.virtual('readCount').get(function () {
  return this.readBy ? this.readBy.length : 0;
});

AnnouncementSchema.index({ targetAudience: 1, isPublished: 1 });
AnnouncementSchema.index({ publishedAt: -1 });

module.exports = mongoose.model('Announcement', AnnouncementSchema);
