const mongoose = require('mongoose');

/**
 * The school's own details for its printed documents: address, contacts, the
 * logo and the head's signature. One document per deployment.
 *
 * Kept in the database, not the environment or the code, so the school's
 * office can change them from the portal, and because a hard-coded address
 * would become every school's (one codebase, many schools). The name stays in
 * SCHOOL_NAME: it is printed before anyone signs in and set at deployment.
 *
 * Images are stored as bytes here rather than on Cloudinary. The logo is
 * public anyway; the signature must not be: on a public URL anyone could lift
 * it onto a forged document. It only travels inside a report card, to someone
 * already allowed to see that card.
 */
const ImageSchema = new mongoose.Schema(
  {
    data: { type: Buffer, select: false },
    contentType: String,
    updatedAt: Date,
  },
  { _id: false },
);

const SchoolSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'school', unique: true },
    address: { type: String, trim: true, maxlength: 200 },
    email: { type: String, trim: true, maxlength: 120 },
    phones: { type: String, trim: true, maxlength: 120 },
    logo: ImageSchema,
    signature: ImageSchema,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

/** The one settings document, created empty the first time it is asked for. */
SchoolSettingsSchema.statics.current = async function (select) {
  const query = this.findOne({ key: 'school' });
  if (select) query.select(select);
  const found = await query.lean();
  return found || { key: 'school' };
};

module.exports = mongoose.model('SchoolSettings', SchoolSettingsSchema);
