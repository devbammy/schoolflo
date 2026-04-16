const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { ROLES } = require('../config/constants');

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
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        'Please provide a valid email',
      ],
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
UserSchema.index({ email: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ 'studentProfile.admissionNumber': 1 });
UserSchema.index({ 'teacherProfile.staffId': 1 });

// Hash password before save
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  this.passwordChangedAt = Date.now() - 1000;
  next();
});

// Compare password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT Access Token
UserSchema.methods.generateAccessToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, email: this.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' },
  );
};

// Generate JWT Refresh Token
UserSchema.methods.generateRefreshToken = function () {
  return jwt.sign({ id: this._id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d',
  });
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
