const cloudinary = require('cloudinary').v2;
const fs = require('fs');
const path = require('path');

// Configure Cloudinary from environment variable
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a file to Cloudinary
 * @param {string} filePath - Local path to the file
 * @param {string} folder - Cloudinary folder name
 * @param {object} options - Additional Cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload result
 */
async function uploadToCloudinary(filePath, folder = 'uploads', options = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const defaultOptions = {
      folder,
      resource_type: 'auto',
      ...options,
    };

    const result = await cloudinary.uploader.upload(filePath, defaultOptions);

    // Delete local file after successful upload
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.warn('Failed to delete local file after upload:', err.message);
    }

    return result;
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

/**
 * Upload a buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} filename - Original filename
 * @param {string} folder - Cloudinary folder name
 * @param {object} options - Additional Cloudinary upload options
 * @returns {Promise<object>} Cloudinary upload result
 */
async function uploadBufferToCloudinary(buffer, filename, folder = 'uploads', options = {}) {
  try {
    // Generate a unique public_id to prevent overwriting existing images
    // when different products are uploaded with the same original filename.
    const baseName = path.parse(filename).name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${require('crypto').randomUUID().split('-')[0]}`;
    const uniquePublicId = `${baseName}_${uniqueSuffix}`;

    const defaultOptions = {
      folder,
      resource_type: 'auto',
      public_id: uniquePublicId,
      ...options,
    };

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        defaultOptions,
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error('Cloudinary buffer upload error:', error);
    throw error;
  }
}

/**
 * Delete a file from Cloudinary
 * @param {string} publicId - Cloudinary public ID
 * @returns {Promise<object>} Cloudinary delete result
 */
async function deleteFromCloudinary(publicId) {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
}

/**
 * Get the secure URL for a Cloudinary resource
 * @param {string} publicId - Cloudinary public ID
 * @param {object} transformations - Image transformations
 * @returns {string} Secure URL
 */
function getCloudinaryUrl(publicId, transformations = {}) {
  return cloudinary.url(publicId, {
    secure: true,
    ...transformations,
  });
}

module.exports = {
  uploadToCloudinary,
  uploadBufferToCloudinary,
  deleteFromCloudinary,
  getCloudinaryUrl,
  cloudinary,
};
