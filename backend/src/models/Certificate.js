const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema(
  {
    certificateType: {
      type: String,
      enum: [
        'Report Card',
        'School Leaving Certificate',
        'Admission Letter',
        'Character Certificate',
        'Transfer Certificate',
      ],
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    class: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Class',
    },
    term: String,
    academicYear: String,
    certificateNumber: {
      type: String,
      unique: true,
    },
    issueDate: {
      type: Date,
      default: Date.now,
    },
    validUntil: Date, // For admission letters
    data: {
      type: mongoose.Schema.Types.Mixed, // Flexible structure for different certificate types
      required: true,
    },
    pdfUrl: String, // Cloudinary URL after generation
    publicId: String, // Cloudinary public ID
    issuedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    signature: String, // Principal/Admin signature image URL
    schoolStamp: String, // School stamp image URL
    status: {
      type: String,
      enum: ['Draft', 'Issued', 'Revoked'],
      default: 'Draft',
    },
    revokedAt: Date,
    revokedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    revokeReason: String,
  },
  {
    timestamps: true,
  },
);

// Auto-generate certificate number
certificateSchema.pre('save', async function (next) {
  if (!this.certificateNumber) {
    const year = new Date().getFullYear();

    const typePrefix = {
      'Report Card': 'RC',
      'School Leaving Certificate': 'SLC',
      'Admission Letter': 'ADM',
      'Character Certificate': 'CC',
      'Transfer Certificate': 'TC',
    }[this.certificateType];

    const lastCertificate = await mongoose
      .model('Certificate')
      .findOne({
        certificateType: this.certificateType,
      })
      .sort({ createdAt: -1 });

    let nextNumber = 1;

    if (lastCertificate?.certificateNumber) {
      const parts = lastCertificate.certificateNumber.split('/');
      nextNumber = parseInt(parts[2]) + 1;
    }

    this.certificateNumber = `${typePrefix}/${year}/${String(
      nextNumber,
    ).padStart(5, '0')}`;
  }

  next();
});

// Index for queries
certificateSchema.index({ student: 1, certificateType: 1, academicYear: 1 });
certificateSchema.index({ certificateNumber: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
