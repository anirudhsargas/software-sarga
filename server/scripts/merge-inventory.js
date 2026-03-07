const { pool } = require('../database');

async function mergeInventory() {
    console.log('Starting inventory merge...');
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. Find duplicates by name and category (where SKU is null or empty)
        // OR duplicates by SKU

        // Let's handle Name + Category first as that's what we see in the screenshot
        const [duplicates] = await connection.query(`
            SELECT name, category, COUNT(*) as count, GROUP_CONCAT(id ORDER BY created_at DESC) as ids
            FROM sarga_inventory
            GROUP BY name, category
            HAVING count > 1
        `);

        console.log(`Found ${duplicates.length} sets of duplicates.`);

        for (const row of duplicates) {
            const ids = row.ids.split(',').map(Number);
            const keepId = ids[0]; // Keep the most recent one
            const mergeIds = ids.slice(1);

            console.log(`Merging ${row.name} into ID ${keepId}. Moving stats from IDs: ${mergeIds.join(', ')}`);

            // Get total quantity to add
            const [qtyRows] = await connection.query("SELECT SUM(quantity) as total_qty FROM sarga_inventory WHERE id IN (?)", [mergeIds]);
            const totalAddQty = Number(qtyRows[0].total_qty) || 0;

            // Update the keep item
            await connection.query("UPDATE sarga_inventory SET quantity = quantity + ? WHERE id = ?", [totalAddQty, keepId]);

            // Update references in other tables
            await connection.query("UPDATE sarga_products SET inventory_item_id = ? WHERE inventory_item_id IN (?)", [keepId, mergeIds]);
            await connection.query("UPDATE sarga_vendor_bill_items SET inventory_item_id = ? WHERE inventory_item_id IN (?)", [keepId, mergeIds]);

            // Delete the old ones
            await connection.query("DELETE FROM sarga_inventory WHERE id IN (?)", [mergeIds]);
        }

        // 2. Handle SKU duplicates specifically if any (though SKU has a unique constraint, maybe some empty strings?)
        const [skuDuplicates] = await connection.query(`
            SELECT sku, COUNT(*) as count, GROUP_CONCAT(id ORDER BY created_at DESC) as ids
            FROM sarga_inventory
            WHERE sku IS NOT NULL AND sku != ''
            GROUP BY sku
            HAVING count > 1
        `);

        console.log(`Found ${skuDuplicates.length} sets of SKU duplicates.`);
        for (const row of skuDuplicates) {
            const ids = row.ids.split(',').map(Number);
            const keepId = ids[0];
            const mergeIds = ids.slice(1);

            const [qtyRows] = await connection.query("SELECT SUM(quantity) as total_qty FROM sarga_inventory WHERE id IN (?)", [mergeIds]);
            const totalAddQty = Number(qtyRows[0].total_qty) || 0;

            await connection.query("UPDATE sarga_inventory SET quantity = quantity + ? WHERE id = ?", [totalAddQty, keepId]);
            await connection.query("UPDATE sarga_products SET inventory_item_id = ? WHERE inventory_item_id IN (?)", [keepId, mergeIds]);
            await connection.query("UPDATE sarga_vendor_bill_items SET inventory_item_id = ? WHERE inventory_item_id IN (?)", [keepId, mergeIds]);
            await connection.query("DELETE FROM sarga_inventory WHERE id IN (?)", [mergeIds]);
        }

        await connection.commit();
        console.log('Merge complete successfully.');
    } catch (err) {
        await connection.rollback();
        console.error('Merge failed:', err);
    } finally {
        connection.release();
        process.exit();
    }
}

mergeInventory();
