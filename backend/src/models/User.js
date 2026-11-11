const crypto = require('crypto');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ROLES } = require('../config/constants');
const { placeholderEmail } = require('../utils/mailbox');

const UserSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [50, 'First name cannot exceed 50 characters'],
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [50, 'Last name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      // Deliberately loose: the real test of an address is whether the welcome
      // email arrives. The previous pattern capped the TLD at three letters,
      // so `.info`, `.school`, `.africa` and `.online` were refused (and
      // `parent+kid@gmail.com` too), after the CSV preview had passed them.
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.STUDENT,
    },
    phone: {
      type: String,
      trim: true,
    },
    avatar: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isEmailVerified: {
      type: Boolean,
      default: false,
    },
    lastLogin: {
      type: Date,
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpire: Date,

    // Student-specific fields
    studentProfile: {
      admissionNumber: { type: String, unique: true, sparse: true },
      dateOfBirth: Date,
      gender: { type: String, enum: ['Male', 'Female', 'Other'] },
      address: String,
      class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      section: String,
      admissionDate: { type: Date, default: Date.now },
      parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      bloodGroup: String,
      medicalNotes: String,
      profileStatus: {
        type: String,
        enum: ['Active', 'Graduated', 'Withdrawn', 'Suspended'],
        default: 'Active',
      },
      graduationDate: Date,
      // An admin's decision to show this student's results although fees are
      // not complete: a scholarship, an agreed payment plan. Absent means no
      // exception. See services/resultAccessService.js.
      resultsRelease: {
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
        note: { type: String, trim: true, maxlength: 200 },
      },
      // The opposite: results hidden from this student and their parents
      // whatever has been paid. Never set together with resultsRelease.
      resultsWithheld: {
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: Date,
        note: { type: String, trim: true, maxlength: 200 },
      },
      // Where this student WAS. `class` above only says where they are now.
      // See utils/enrolment.js.
      enrolments: [
        {
          _id: false,
          class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
          academicYear: String,
        },
      ],
    },

    // Teacher-specific fields
    teacherProfile: {
      staffId: { type: String, unique: true, sparse: true },
      qualification: String,
      specialization: String,
      experience: Number,
      joinDate: { type: Date, default: Date.now },
      designation: String,
      classTeacherOf: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
      subjectsTaught: [
        { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
      ],
      salary: { type: Number, select: false },
    },

    // Parent-specific fields
    parentProfile: {
      occupation: String,
      relationship: {
        type: String,
        enum: ['Father', 'Mother', 'Guardian', 'Other'],
      },
      children: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Virtual: Full Name
UserSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Indexes
UserSchema.index({ role: 1 });

// A student with no email of their own gets an address that can never receive
// mail, so `email` stays required and unique for everyone (see utils/mailbox).
// pre('validate'), not pre('save'): validation runs first, and a required field
// filled in by a save hook can never be satisfied.
UserSchema.pre('validate', function (next) {
  if (this.role === 'Student' && !this.email) {
    this.email = placeholderEmail(this._id);
  }
  next();
});

// Admission Number and harshed password
UserSchema.pre('save', async function (next) {
  try {
    // hash password first
    if (this.isModified('password')) {
      const salt = await bcrypt.genSalt(12);
      this.password = await bcrypt.hash(this.password, salt);
      this.passwordChangedAt = Date.now() - 1000;
    }

    // admission number
    if (this.role === 'Student' && !this.studentProfile?.admissionNumber) {
      if (!this.studentProfile) this.studentProfile = {};

      const Counter = require('./Counter');

      const firstNamePrefix = (this.firstName || 'XX')
        .substring(0, 1)
        .toUpperCase()
        .padEnd(1, 'X');

      const lastNamePrefix = (this.lastName || 'XX')
        .substring(0, 1)
        .toUpperCase()
        .padEnd(1, 'X');

      const prefix = `${firstNamePrefix}${lastNamePrefix}`;

      const year = new Date().getFullYear().toString().slice(-2);

      const counter = await Counter.findOneAndUpdate(
        { year },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );

      const index = counter.seq.toString().padStart(4, '0');

      this.studentProfile.admissionNumber = `${prefix}${year}${index}`;
      this.markModified('studentProfile');
    }
    if (this.role === 'Teacher' && !this.teacherProfile?.staffId) {
      if (!this.teacherProfile) this.teacherProfile = {};

      const Counter = require('./Counter');

      const firstNamePrefix = (this.firstName || 'XX')
        .substring(0, 1)
        .toUpperCase()
        .padEnd(1, 'X');

      const lastNamePrefix = (this.lastName || 'XX')
        .substring(0, 1)
        .toUpperCase()
        .padEnd(1, 'X');

      const prefix = `${firstNamePrefix}${lastNamePrefix}`;

      const year = new Date().getFullYear().toString().slice(-2);

      const counter = await Counter.findOneAndUpdate(
        { year },
        { $inc: { seq: 1 } },
        { new: true, upsert: true },
      );

      const index = counter.seq.toString().padStart(4, '0');

      this.teacherProfile.staffId = `${prefix}${year}${index}`;
      this.markModified('teacherProfile');
    }

    next();
  } catch (err) {
    next(err);
  }
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT Access Token.
// Short lived on purpose: an access token cannot be revoked, so its lifetime
// IS its blast radius. The client refreshes transparently on 401, and the
// refresh token behind it is revocable (see models/Session.js).
UserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, email: this.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '1h' },
  );
};

// Generate JWT Refresh Token
//
// The `jti` is not decoration. Without it the payload is just { id }, and
// jsonwebtoken stamps iat/exp in whole seconds — so two tokens minted for the
// same user inside the same second are byte-identical. That collides on
// Session.tokenHash's unique index, and it makes rotation impossible: the
// "new" token would hash to the row we are trying to replace.
UserSchema.methods.generateRefreshToken = function () {
  return jwt.sign(
    { id: this._id, jti: crypto.randomBytes(16).toString('hex') },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' },
  );
};

// Check if password changed after token issued
UserSchema.methods.changedPasswordAfter = function (jwtTimestamp) {
  if (this.passwordChangedAt) {
    const changedAt = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return jwtTimestamp < changedAt;
  }
  return false;
};

module.exports = mongoose.model('User', UserSchema);
