/**
 * Migration Script: Upload local /uploads/ files to Cloudinary and update DB references.
 *
 * Run this LOCALLY (where the uploads/ folder still has files) BEFORE deploying to Render.
 *
 * Usage:
 *   cd server
 *   node scripts/migrateUploadsToCloudinary.js
 *
 * What it does:
 *   1. Scans DB tables for image_url / file_path columns containing /uploads/...
 *   2. Checks if the local file exists
 *   3. Uploads to Cloudinary
 *   4. Updates the DB record with the new Cloudinary URL
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const fs = require('fs');
const { pool } = require('../database');
const { uploadToCloudinary } = require('../helpers/cloudinaryUpload');

const uploadsDir = path.join(__dirname, '..', 'uploads');

// Tables and columns that may contain /uploads/ references
const MIGRATION_TARGETS = [
  { table: 'sarga_products', column: 'image_url', folder: 'products' },
  { table: 'sarga_product_categories', column: 'image_url', folder: 'product-categories' },
  { table: 'sarga_product_subcategories', column: 'image_url', folder: 'product-subcategories' },
  { table: 'sarga_staff', column: 'image_url', folder: 'staff' },
  { table: 'sarga_product_image_requests', column: 'proposed_image_url', folder: 'product-image-requests' },
  { table: 'sarga_product_image_requests', column: 'current_image_url', folder: 'product-images' },
  { table: 'sarga_bills_documents', column: 'file_path', folder: 'bills-documents' },
];

async function migrate() {
  console.log('=== Cloudinary Migration Script ===\n');

  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    console.error('ERROR: Cloudinary credentials not set in .env');
    process.exit(1);
  }

  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const target of MIGRATION_TARGETS) {
    console.log(`\n--- Scanning ${target.table}.${target.column} ---`);

    try {
      const [rows] = await pool.query(
        `SELECT id, ${target.column} AS url FROM ${target.table} WHERE ${target.column} LIKE '/uploads/%'`
      );

      if (rows.length === 0) {
        console.log(`  No local /uploads/ references found.`);
        continue;
      }

      console.log(`  Found ${rows.length} records with local paths.`);

      for (const row of rows) {
        const fileName = path.basename(row.url);
        const localPath = path.join(uploadsDir, fileName);

        if (!fs.existsSync(localPath)) {
          console.log(`  [SKIP] ID ${row.id}: File not found locally: ${fileName}`);
          totalSkipped++;
          continue;
        }

        try {
          console.log(`  [UPLOADING] ID ${row.id}: ${fileName} -> Cloudinary/${target.folder}`);
          const result = await uploadToCloudinary(localPath, target.folder);
          const cloudinaryUrl = result.secure_url;

          await pool.query(
            `UPDATE ${target.table} SET ${target.column} = ? WHERE id = ?`,
            [cloudinaryUrl, row.id]
          );

          console.log(`  [OK] ID ${row.id}: ${cloudinaryUrl}`);
          totalMigrated++;
        } catch (err) {
          console.error(`  [FAIL] ID ${row.id}: ${err.message}`);
          totalFailed++;
        }
      }
    } catch (err) {
      console.error(`  [ERROR] Table query failed: ${err.message}`);
    }
  }

  console.log('\n=== Migration Complete ===');
  console.log(`  Migrated: ${totalMigrated}`);
  console.log(`  Skipped (file missing): ${totalSkipped}`);
  console.log(`  Failed: ${totalFailed}`);

  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration script crashed:', err);
  process.exit(1);
});
