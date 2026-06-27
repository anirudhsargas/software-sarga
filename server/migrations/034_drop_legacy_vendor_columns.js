// Migration 034: Drop legacy type and gstin columns from vendors table
module.exports = async (connection) => {
  const dbName = process.env.DB_NAME || 'defaultdb';

  console.log('[Migration 034] Dropping legacy vendor columns...');

  const checkColumn = async (table, col) => {
    const [rows] = await connection.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [dbName, table, col]
    );
    return rows.length > 0;
  };

  // 1. Verify data integrity before dropping gstin
  if (await checkColumn('vendors', 'gstin')) {
    const [orphans] = await connection.query(
      `SELECT COUNT(*) as cnt FROM vendors WHERE (gstin IS NOT NULL AND gstin != '') AND (gst_number IS NULL OR gst_number = '')`
    );
    if (orphans[0].cnt > 0) {
      // Copy any remaining gstin values into gst_number
      await connection.query(
        `UPDATE vendors SET gst_number = gstin WHERE (gst_number IS NULL OR gst_number = '') AND (gstin IS NOT NULL AND gstin != '')`
      );
      console.log(`[Migration 034] Copied ${orphans[0].cnt} gstin values into gst_number`);
    }

    await connection.query(`ALTER TABLE vendors DROP COLUMN gstin`);
    console.log('[Migration 034] Dropped vendors.gstin column');
  } else {
    console.log('[Migration 034] vendors.gstin already dropped, skipping');
  }

  // 2. Verify data integrity before dropping type
  if (await checkColumn('vendors', 'type')) {
    const [typeOrphans] = await connection.query(
      `SELECT COUNT(*) as cnt FROM vendors WHERE (type IS NOT NULL AND type != '') AND (vendor_type IS NULL OR vendor_type = '')`
    );
    if (typeOrphans[0].cnt > 0) {
      await connection.query(
        `UPDATE vendors SET vendor_type = LOWER(type) WHERE (vendor_type IS NULL OR vendor_type = '') AND (type IS NOT NULL AND type != '')`
      );
      console.log(`[Migration 034] Copied ${typeOrphans[0].cnt} type values into vendor_type`);
    }

    await connection.query(`ALTER TABLE vendors DROP COLUMN type`);
    console.log('[Migration 034] Dropped vendors.type column');
  } else {
    console.log('[Migration 034] vendors.type already dropped, skipping');
  }

  console.log('[Migration 034] Legacy columns dropped successfully.');
};
