const SchoolSettings = require('../models/SchoolSettings');
const AppError = require('../utils/AppError');
const { sendSuccess } = require('../utils/apiResponse');
const audit = require('../services/auditService');

/**
 * The school's details for its report cards and letters: address, email,
 * phone numbers, logo and the head's signature. Admin only, except the logo,
 * which is public (it heads every card and the sign-in page may use it).
 */

const IMAGES = ['logo', 'signature'];

const describe = (settings) => ({
  address: settings.address || '',
  email: settings.email || '',
  phones: settings.phones || '',
  hasLogo: Boolean(settings.logo?.updatedAt),
  hasSignature: Boolean(settings.signature?.updatedAt),
  logoVersion: settings.logo?.updatedAt
    ? new Date(settings.logo.updatedAt).getTime()
    : null,
});

// @desc    The school's details
// @route   GET /api/v1/school-settings
// @access  Admin
const getSettings = async (req, res) =>
  sendSuccess(
    res,
    200,
    'School details',
    describe(await SchoolSettings.current()),
  );

// @desc    Change the address, email or phone numbers
// @route   PUT /api/v1/school-settings   { address, email, phones }
// @access  Admin
const updateSettings = async (req, res) => {
  const before = await SchoolSettings.current();
  const set = { updatedBy: req.user._id };
  ['address', 'email', 'phones'].forEach((field) => {
    if (req.body[field] !== undefined) set[field] = req.body[field];
  });

  await SchoolSettings.updateOne(
    { key: 'school' },
    { $set: set },
    { upsert: true },
  );
  const after = await SchoolSettings.current();

  await audit.record(req, {
    action: 'school.settings',
    entity: 'SchoolSettings',
    entityLabel: 'School details',
    changes: audit.diff(
      { address: before.address, email: before.email, phones: before.phones },
      { address: after.address, email: after.email, phones: after.phones },
    ),
  });

  return sendSuccess(res, 200, 'School details saved', describe(after));
};

// @desc    Upload the logo or the head's signature (an image, 1 MB at most)
// @route   PUT /api/v1/school-settings/:image   (multipart "file")
// @access  Admin
const uploadImage = async (req, res) => {
  const { image } = req.params;
  if (!IMAGES.includes(image)) throw AppError.notFound('Not found');
  if (!req.file) throw AppError.badRequest('Attach an image file.');

  await SchoolSettings.updateOne(
    { key: 'school' },
    {
      $set: {
        [image]: {
          data: req.file.buffer,
          contentType: req.file.mimetype,
          updatedAt: new Date(),
        },
        updatedBy: req.user._id,
      },
    },
    { upsert: true },
  );

  await audit.record(req, {
    action: `school.${image}`,
    entity: 'SchoolSettings',
    entityLabel: image === 'logo' ? 'School logo' : "Head's signature",
    meta: { contentType: req.file.mimetype, bytes: req.file.size },
  });

  return sendSuccess(
    res,
    200,
    image === 'logo' ? 'Logo saved' : 'Signature saved',
    describe(await SchoolSettings.current()),
  );
};

// @desc    Remove the logo or the signature
// @route   DELETE /api/v1/school-settings/:image
// @access  Admin
const removeImage = async (req, res) => {
  const { image } = req.params;
  if (!IMAGES.includes(image)) throw AppError.notFound('Not found');
  await SchoolSettings.updateOne(
    { key: 'school' },
    { $unset: { [image]: '' } },
  );
  await audit.record(req, {
    action: `school.${image}_removed`,
    entity: 'SchoolSettings',
    entityLabel: image === 'logo' ? 'School logo' : "Head's signature",
  });
  return sendSuccess(
    res,
    200,
    'Removed',
    describe(await SchoolSettings.current()),
  );
};

// @desc    The logo itself
// @route   GET /api/v1/config/logo
// @access  Public
const serveLogo = async (req, res) => {
  const settings = await SchoolSettings.findOne({ key: 'school' })
    .select('+logo.data logo.contentType logo.updatedAt')
    .lean();
  if (!settings?.logo?.data) throw AppError.notFound('No logo');

  // The URL carries ?v=<updatedAt>, so a new logo is a new URL and the old one
  // may be cached for good.
  res.set('Content-Type', settings.logo.contentType);
  res.set('Cache-Control', 'public, max-age=31536000, immutable');
  res.set('X-Content-Type-Options', 'nosniff');
  return res.send(Buffer.from(settings.logo.data.buffer || settings.logo.data));
};

/**
 * The head's signature as a data URL, for a report card about to be sent to
 * someone allowed to see it. Never on a URL of its own (see SchoolSettings).
 */
const signatureDataUrl = async () => {
  const settings = await SchoolSettings.findOne({ key: 'school' })
    .select('+signature.data signature.contentType')
    .lean();
  const sig = settings?.signature;
  if (!sig?.data) return null;
  const bytes = Buffer.from(sig.data.buffer || sig.data);
  return `data:${sig.contentType};base64,${bytes.toString('base64')}`;
};

module.exports = {
  getSettings,
  updateSettings,
  uploadImage,
  removeImage,
  serveLogo,
  signatureDataUrl,
  describe,
};
