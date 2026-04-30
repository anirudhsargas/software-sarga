/**
 * Step 1: Upload ALL local /uploads/ files to Cloudinary (without needing DB).
 *
 * This ensures every file is available on Cloudinary before we update the DB.
 * The Cloudinary public_id will be: uploads/<original-filename-without-ext>
 * so the server's existing fallback logic can find them.
 *
 * Usage:
 *   cd server
 *   node scripts/uploadLocalFilesToCloudinary.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const uploadsDir = path.join(__dirname, '..', 'uploads');

async function uploadAll() {
  console.log('=== Upload Local Files to Cloudinary ===\n');

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    console.error('ERROR: Cloudinary credentials not set in .env');
    process.exit(1);
  }

  if (!fs.existsSync(uploadsDir)) {
    console.error('ERROR: uploads/ directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(uploadsDir).filter(f => {
    const fullPath = path.join(uploadsDir, f);
    return fs.statSync(fullPath).isFile();
  });

  console.log(`Found ${files.length} files in uploads/\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const filePath = path.join(uploadsDir, file);
    const baseName = path.parse(file).name;
    const publicId = `uploads/${baseName}`;

    // Check if already exists on Cloudinary
    try {
      await cloudinary.api.resource(publicId, { resource_type: 'auto' });
      console.log(`  [EXISTS] ${file} — already on Cloudinary`);
      skipped++;
      continue;
    } catch (e) {
      // Not found — proceed to upload
    }

    try {
      console.log(`  [UPLOADING] ${file}...`);
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'uploads',
        public_id: baseName,
        resource_type: 'auto',
        overwrite: false,
      });
      console.log(`  [OK] ${file} → ${result.secure_url}`);
      uploaded++;
    } catch (err) {
      console.error(`  [FAIL] ${file}: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=== Upload Complete ===');
  console.log(`  Uploaded: ${uploaded}`);
  console.log(`  Already existed: ${skipped}`);
  console.log(`  Failed: ${failed}`);

  process.exit(0);
}

uploadAll().catch((err) => {
  console.error('Script crashed:', err);
  process.exit(1);
});
