const { pool } = require('./database');

async function fixBrokenLinks() {
    try {
        console.log('Finding products with null inventory_item_id but matching inventory items...');
        
        // Find products with null inventory_item_id
        const [products] = await pool.query('SELECT id, name, product_code FROM sarga_products WHERE inventory_item_id IS NULL AND is_physical_product = 1');
        
        let fixedCount = 0;
        for (const product of products) {
            let invId = null;
            
            // Try to match by SKU
            if (product.product_code) {
                const [invRows] = await pool.query('SELECT id FROM sarga_inventory WHERE sku = ?', [product.product_code]);
                if (invRows.length > 0) {
                    invId = invRows[0].id;
                }
            }
            
            // Try to match by Name
            if (!invId) {
                const [invRows] = await pool.query('SELECT id FROM sarga_inventory WHERE name = ?', [product.name]);
                if (invRows.length === 1) { // Only link if exact single match
                    invId = invRows[0].id;
                }
            }
            
            if (invId) {
                console.log(`Linking Product ID ${product.id} (${product.name}) to Inventory ID ${invId}`);
                await pool.query('UPDATE sarga_products SET inventory_item_id = ? WHERE id = ?', [invId, product.id]);
                fixedCount++;
            }
        }
        
        console.log(`Fixed ${fixedCount} broken links.`);
    } catch (err) {
        console.error('Error fixing links:', err);
    } finally {
        process.exit(0);
    }
}

fixBrokenLinks();
