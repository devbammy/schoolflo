const mongoose = require('mongoose');
const Sequence = require('./Sequence');

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
    // The document itself. Kept here and served only through the
    // authenticated download route, never as a public URL: these are children's
    // names and grades. `select: false` so no ordinary query carries it, and
    // the toJSON transform below strips it from any response regardless.
    pdfData: { type: Buffer, select: false },
    pdfSize: Number,

    // Documents issued before PDFs moved into the database sit on public
    // Cloudinary URLs. Kept only so they can be migrated (see
    // utils/migrateCertificatePdfs.js); new certificates never set these.
    pdfUrl: String,
    publicId: String,
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
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.pdfData;
        // The legacy public link is not handed out either; downloads go
        // through GET /certificates/:id/download.
        delete ret.pdfUrl;
        delete ret.publicId;
        delete ret.id;
        return ret;
      },
    },
  },
);

// Whether there is a document to download — the client shows the button on
// this, since it no longer receives a URL.
certificateSchema.virtual('hasPdf').get(function () {
  return Boolean(this.pdfSize || this.pdfUrl);
});

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

    // Issued from an atomic sequence. Adding one to the last number read gave
    // two simultaneous issues the same number, and the second then failed on
    // the unique index. The last number only seeds the sequence, so numbering
    // carries on from what has already been printed.
    const issued = lastCertificate?.certificateNumber
      ? parseInt(lastCertificate.certificateNumber.split('/')[2], 10) || 0
      : 0;

    const sequenceKey = `certificate-${typePrefix}`;
    await Sequence.atLeast(sequenceKey, issued);
    const nextNumber = await Sequence.next(sequenceKey);

    this.certificateNumber = `${typePrefix}/${year}/${String(
      nextNumber,
    ).padStart(5, '0')}`;
  }

  next();
});

// Index for queries
certificateSchema.index({ student: 1, certificateType: 1, academicYear: 1 });

module.exports = mongoose.model('Certificate', certificateSchema);
