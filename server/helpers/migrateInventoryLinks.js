const { pool } = require('../database');
const logger = require('./logger');

async function cleanDuplicateInventoryLinks() {
    try {
        logger.info('[Migration] Checking for duplicate inventory_item_id links in sarga_products...');
        
        // Find inventory_item_ids that are shared by multiple products
        const [sharedRows] = await pool.query(
            `SELECT inventory_item_id, COUNT(*) as cnt 
             FROM sarga_products 
             WHERE inventory_item_id IS NOT NULL 
             GROUP BY inventory_item_id 
             HAVING cnt > 1`
        );
        
        if (sharedRows.length === 0) {
            logger.info('[Migration] No shared inventory item links found. Database is clean!');
            return;
        }
        
        logger.info(`[Migration] Found ${sharedRows.length} inventory items shared across multiple products.`);
        
        for (const row of sharedRows) {
            const inventoryItemId = row.inventory_item_id;
            
            // Get all products sharing this inventory item, sorted by ID so the oldest keeps the link
            const [products] = await pool.query(
                `SELECT id, name, product_code, company_code, size, subcategory_id 
                 FROM sarga_products 
                 WHERE inventory_item_id = ? 
                 ORDER BY id ASC`,
                [inventoryItemId]
            );
            
            if (products.length <= 1) continue;
            
            // Fetch the details of the original inventory item
            const [invRows] = await pool.query(
                `SELECT * FROM sarga_inventory WHERE id = ?`,
                [inventoryItemId]
            );
            if (invRows.length === 0) continue;
            const originalInv = invRows[0];
            
            logger.info(`[Migration] Resolving shared inventory ID #${inventoryItemId} (kept by Product #${products[0].id}: ${products[0].name})`);
            
            // For subsequent products, clone the inventory item and assign the clone
            for (let i = 1; i < products.length; i++) {
                const prod = products[i];
                
                // Get subcategory name for inventory category
                const [subRows] = await pool.query(
                    `SELECT s.name AS sub_name FROM sarga_product_subcategories s WHERE s.id = ?`,
                    [prod.subcategory_id]
                );
                const inventoryCategory = subRows.length > 0 ? subRows[0].sub_name : originalInv.category;
                
                // Build a new unique SKU or fallback
                let sku = prod.product_code || null;
                if (!sku) {
                    const c = String(prod.company_code || originalInv.source_code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const p = String(prod.name || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const s = String(prod.size || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
                    const parts = [c, p, s].filter(Boolean);
                    if (parts.length > 0) sku = parts.join('-');
                }
                
                // Trim and truncate size_code to 100 chars if it exceeds that length
                let sizeCodeValue = prod.size || originalInv.size_code || null;
                if (sizeCodeValue) {
                    sizeCodeValue = String(sizeCodeValue).trim();
                    if (sizeCodeValue.length > 100) {
                        sizeCodeValue = sizeCodeValue.substring(0, 100);
                    }
                }

                // Insert new cloned inventory item with the product's actual name
                const [insertResult] = await pool.query(
                    `INSERT INTO sarga_inventory 
                     (name, sku, category, unit, quantity, reorder_level, cost_price, sell_price, item_type, source_code, model_name, size_code, hsn, gst_rate, vendor_name, vendor_contact, purchase_link)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        prod.name,
                        sku || null,
                        inventoryCategory,
                        originalInv.unit || 'pcs',
                        originalInv.quantity || 0, // Carry over quantity safely
                        originalInv.reorder_level || 0,
                        originalInv.cost_price || 0,
                        originalInv.sell_price || 0,
                        originalInv.item_type || 'Retail',
                        prod.company_code || originalInv.source_code || null,
                        prod.name,
                        sizeCodeValue,
                        originalInv.hsn || null,
                        originalInv.gst_rate || 0,
                        originalInv.vendor_name || null,
                        originalInv.vendor_contact || null,
                        originalInv.purchase_link || null
                    ]
                );
                
                const newInventoryId = insertResult.insertId;
                
                // Auto-generate SKU if still none
                if (!sku) {
                    const catPart = (inventoryCategory || 'INV').substring(0, 3).toUpperCase().replace(/[^A-Z]/g, '') || 'INV';
                    const autoSku = `${catPart}-${String(newInventoryId).padStart(4, '0')}`;
                    await pool.query('UPDATE sarga_inventory SET sku = ? WHERE id = ?', [autoSku, newInventoryId]);
                }
                
                // Update the product's link to point to this new inventory item
                await pool.query(
                    `UPDATE sarga_products SET inventory_item_id = ? WHERE id = ?`,
                    [newInventoryId, prod.id]
                );
                
                logger.info(`[Migration] Product #${prod.id} (${prod.name}) migrated to new unique Inventory item #${newInventoryId}`);
            }
        }
        
        logger.info('[Migration] Duplicate inventory links resolution complete!');
    } catch (err) {
        logger.error('[Migration] Failed to clean duplicate inventory links:', err);
    }
}

module.exports = { cleanDuplicateInventoryLinks };
