const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const path = require('path');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer memory storage (files go to Cloudinary directly)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const ALLOWED_TYPES = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
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

  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type '${file.mimetype}' is not allowed.`), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
});

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
      }
    );
    uploadStream.end(buffer);
  });
};

/**
 * Delete a file from Cloudinary
 */
const deleteFromCloudinary = async (publicId, resourceType = 'auto') => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error(`Cloudinary delete error: ${error.message}`);
    return null;
  }
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
        mimeType: file.mimetype,
        size: file.size,
      };
    })
  );

  return uploads;
};

module.exports = {
  upload,
  uploadToCloudinary,
  deleteFromCloudinary,
  processUploadedFiles,
  cloudinary,
};
