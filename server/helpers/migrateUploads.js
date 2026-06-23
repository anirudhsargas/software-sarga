/**
 * Auto-migrate /uploads/ references in the database to Cloudinary URLs.
 * Called once on server startup. Runs in the background without blocking.
 *
 * For each DB record that has a /uploads/xxx path, it:
 *   1. Searches Cloudinary for `uploads/<filename-without-ext>`
 *   2. If found, updates the DB record with the Cloudinary secure_url
 *   3. If not found, sets the column to NULL (file is truly lost)
 */

const { pool } = require('../database');
const { cloudinary } = require('./cloudinaryUpload');
const path = require('path');
const logger = require('./logger');

const MIGRATION_TARGETS = [
  { table: 'sarga_products', column: 'image_url' },
  { table: 'sarga_product_categories', column: 'image_url' },
  { table: 'sarga_product_subcategories', column: 'image_url' },
  { table: 'sarga_staff', column: 'image_url' },
  { table: 'sarga_product_image_requests', column: 'proposed_image_url' },
  { table: 'sarga_product_image_requests', column: 'current_image_url' },
  { table: 'sarga_bills_documents', column: 'file_path' },
];

async function migrateUploadsToCloudinary() {
  if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY) {
    logger.info('[Migration] Cloudinary not configured — skipping upload migration.');
    return;
  }

  let totalMigrated = 0;
  let totalNulled = 0;

  for (const target of MIGRATION_TARGETS) {
    try {
      const [rows] = await pool.query(
        `SELECT id, \`${target.column}\` AS url FROM \`${target.table}\` WHERE \`${target.column}\` LIKE '/uploads/%'`
      );

      if (rows.length === 0) continue;

      logger.info(`[Migration] ${target.table}.${target.column}: ${rows.length} records to migrate`);

      for (const row of rows) {
        const fileName = path.basename(row.url);
        const baseName = path.parse(fileName).name;
        const possiblePublicIds = [`uploads/${baseName}`, baseName];

        let cloudinaryUrl = null;

        for (const pubId of possiblePublicIds) {
          try {
            const resource = await cloudinary.api.resource(pubId, { resource_type: 'image' });
            cloudinaryUrl = resource.secure_url;
            break;
          } catch (_e) {
            // Try next public ID
          }
          // Also try raw resource type (for PDFs, docs)
          try {
            const resource = await cloudinary.api.resource(pubId, { resource_type: 'raw' });
            cloudinaryUrl = resource.secure_url;
            break;
          } catch (_e) {
            // Not found
          }
        }

        if (cloudinaryUrl) {
          await pool.query(
            `UPDATE \`${target.table}\` SET \`${target.column}\` = ? WHERE id = ?`,
            [cloudinaryUrl, row.id]
          );
          totalMigrated++;
        } else {
          // File is truly lost — set to NULL to stop 404 spam
          await pool.query(
            `UPDATE \`${target.table}\` SET \`${target.column}\` = NULL WHERE id = ?`,
            [row.id]
          );
          totalNulled++;
          logger.warn(`[Migration] ${target.table} ID ${row.id}: file not found on Cloudinary (${fileName}), set to NULL`);
        }
      }
    } catch (err) {
      logger.error(`[Migration] Error processing ${target.table}.${target.column}:`, err.message);
    }
  }

  if (totalMigrated > 0 || totalNulled > 0) {
    logger.info(`[Migration] Complete — Migrated: ${totalMigrated}, Cleared: ${totalNulled}`);
  }
}

module.exports = { migrateUploadsToCloudinary };
