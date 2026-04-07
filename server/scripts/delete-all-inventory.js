const { pool } = require('../database');

async function deleteAllInventory() {
    console.log('--- STARTING BULK INVENTORY DELETION ---');
    const connection = await pool.getConnection();

    try {
        await connection.beginTransaction();

        console.log('1. Unlinking products from inventory items...');
        await connection.query('UPDATE sarga_products SET inventory_item_id = NULL, is_physical_product = 0');

        console.log('2. Deleting all items from sarga_inventory...');
        // Due to CASCADE, this clears related tables: consumption, reorders, verification_items, purchase_order_items, vendor_bill_items
        const [result] = await connection.query('DELETE FROM sarga_inventory');
        console.log(`Successfully deleted ${result.affectedRows} inventory items.`);

        await connection.commit();
        console.log('--- DELETION COMPLETED SUCCESSFULLY ---');
    } catch (err) {
        await connection.rollback();
        console.error('FAILED to delete inventory:', err.message);
        process.exit(1);
    } finally {
        connection.release();
        process.exit(0);
    }
}

deleteAllInventory();
