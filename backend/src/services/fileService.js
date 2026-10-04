const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');
const AppError = require('../utils/AppError');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer memory storage (files go to Cloudinary directly)
const storage = multer.memoryStorage();

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const DOCUMENT_TYPES = [
  ...IMAGE_TYPES,
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'application/zip',
];

// Built per uploader so an avatar route can insist on an image. Every route
// shared one list, so a profile picture could be a PDF or a zip.
//
// A refusal is an AppError, not a bare Error: the global handler reports an
// unrecognised Error as a generic 500 and logs a stack trace, so the person
// who picked the wrong file saw "Something went wrong" instead of what was
// wrong with it.
const makeFileFilter = (allowedTypes) => (req, file, cb) => {
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      AppError.badRequest(`File type '${file.mimetype}' is not allowed.`),
      false,
    );
  }
};

const MB = 1024 * 1024;

// Per-purpose size caps. A single global 500KB limit rejected any real phone
// photo or scanned PDF with an opaque multer error.
const UPLOAD_LIMITS = {
  avatar: 1 * MB,
  assignment: 2 * MB,
  submission: 2 * MB,
  announcement: 2 * MB,
  default: 1 * MB,
};

const makeUploader = (limitKey = 'default', allowedTypes = DOCUMENT_TYPES) =>
  multer({
    storage,
    fileFilter: makeFileFilter(allowedTypes),
    limits: {
      fileSize: UPLOAD_LIMITS[limitKey] ?? UPLOAD_LIMITS.default,
    },
  });

/**
 * Default uploader, kept for existing call sites.
 * Prefer the purpose-specific uploaders below so each route carries the limit
 * the documentation promises for that kind of content.
 */
const upload = makeUploader('default');

const uploadAvatar = makeUploader('avatar', IMAGE_TYPES);
const uploadAssignment = makeUploader('assignment');
const uploadSubmission = makeUploader('submission');

/**
 * The bulk-import uploader, with its own filter rather than a wider global
 * one — a CSV has no business being accepted as an avatar.
 *
 * Browsers cannot agree on what a .csv is. Chrome on Windows reports
 * `application/vnd.ms-excel` when Excel owns the file association, some
 * send `application/octet-stream`, and a few send nothing useful at all, so
 * the extension is the tiebreaker. The parser is the real gate: whatever
 * arrives has to survive being read as CSV text.
 */
const CSV_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
];

const uploadCsv = multer({
  storage,
  limits: { fileSize: 2 * MB },
  fileFilter: (req, file, cb) => {
    const isCsvName =
      path.extname(file.originalname || '').toLowerCase() === '.csv';

    if (isCsvName && CSV_MIME_TYPES.includes(file.mimetype || '')) {
      return cb(null, true);
    }

    cb(
      AppError.badRequest(
        'Upload a .csv file. Save your spreadsheet as CSV first.',
      ),
      false,
    );
  },
});

/**
 * Turn multer's terse errors into something a user can act on.
 * Mount after the routes that accept uploads; it passes anything else through.
 */
const handleUploadErrors = (err, req, res, next) => {
  if (!(err instanceof multer.MulterError)) return next(err);

  const messages = {
    LIMIT_FILE_SIZE: 'That file is too large.',
    LIMIT_FILE_COUNT: 'Too many files were uploaded at once.',
    LIMIT_UNEXPECTED_FILE: 'Unexpected file field in the upload.',
  };

  return res.status(400).json({
    success: false,
    message: messages[err.code] || `Upload failed: ${err.message}`,
  });
};

/**
 * Cloudinary stores images, videos and everything else ("raw") separately, and
 * destroy() must be told which. Persist this alongside publicId at upload time
 * so deletions actually delete rather than silently orphaning the file.
 */
const resourceTypeFor = (mimeType = '') => {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
    return 'video';
  }
  return 'raw';
};

/**
 * Upload a buffer directly to Cloudinary
 */
const uploadToCloudinary = (buffer, folder, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: `smp/${folder}`,
        resource_type: 'auto',
        ...options,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      },
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary.
 *
 * `resource_type` accepts image | video | raw — never 'auto', which was the
 * previous default and silently failed for every PDF and document, leaving
 * them orphaned in storage. When the stored type is unknown we try each in
 * turn rather than guessing once.
 */
const deleteFromCloudinary = async (publicId, resourceType) => {
  if (!publicId) return null;

  const candidates =
    resourceType && resourceType !== 'auto'
      ? [resourceType]
      : ['image', 'raw', 'video'];

  for (const type of candidates) {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: type,
      });
      if (result?.result === 'ok') return result;
    } catch (error) {
      console.error(
        `Cloudinary delete error (${type}) for ${publicId}: ${error.message}`,
      );
    }
  }

  console.warn(`Cloudinary: nothing deleted for publicId ${publicId}`);
  return null;
};

/**
 * Process uploaded files and return metadata array
 */
const processUploadedFiles = async (files, folder) => {
  if (!files || !files.length) return [];

  const uploads = await Promise.all(
    files.map(async (file) => {
      const result = await uploadToCloudinary(file.buffer, folder, {
        public_id: `${Date.now()}-${path.parse(file.originalname).name}`,
      });
      return {
        name: file.originalname,
        url: result.secure_url,
        publicId: result.public_id,
        // Recorded from Cloudinary's own response so deletion later knows
        // which resource type to target.
        resourceType: result.resource_type || resourceTypeFor(file.mimetype),
        mimeType: file.mimetype,
        size: file.size,
      };
    }),
  );

  return uploads;
};

module.exports = {
  upload,
  uploadAvatar,
  uploadAssignment,
  uploadSubmission,
  uploadCsv,
  makeUploader,
  handleUploadErrors,
  resourceTypeFor,
  uploadToCloudinary,
  deleteFromCloudinary,
  processUploadedFiles,
  UPLOAD_LIMITS,
  cloudinary,
};
