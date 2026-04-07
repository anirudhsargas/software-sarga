// Image compression middleware for uploads
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

/**
 * Compress and resize uploaded image files before saving.
 * Usage: app.use('/your-upload-route', compressImageUpload);
 */
async function compressImageUpload(req, res, next) {
  if (!req.files && !req.file) return next();
  const files = req.files || [req.file];
  await Promise.all(files.map(async (file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return; // Only compress images
    const compressedPath = file.path.replace(/(\.[^.]+)$/, '-compressed$1');
    await sharp(file.path)
      .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toFile(compressedPath);
    // Replace original with compressed
    await fs.promises.rename(compressedPath, file.path);
  }));
  next();
}

module.exports = compressImageUpload;
