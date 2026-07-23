// Migration 038: Add 'draft' status to vendor_invoices table
// Enables saving purchase bills as drafts before finalizing
module.exports = async (connection) => {
  console.log('[Migration 038] Adding draft status to vendor_invoices...');

  // Modify the status ENUM to include 'draft'
  await connection.query(`
    ALTER TABLE vendor_invoices
    MODIFY COLUMN status ENUM('draft','pending','partial','paid','overdue') NOT NULL DEFAULT 'pending'
  `);

  console.log('[Migration 038] Added draft status to vendor_invoices');
};
